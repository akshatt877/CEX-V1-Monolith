import { Router, type Request, type Response } from "express";
import { dbPool } from "../config/db.js";
import { engine, type Order } from "../engine/orderbook.js";
import crypto from "crypto";
import { parse } from "path";

const router = Router();

//POST /api/orders
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { userId, symbol, price, qty, side, type } = req.body;

  if (!userId || !symbol || !price || !qty || !side || !type) {
    res.status(400).json({
      error: "Missing required order placement fields.",
    });
    return;
  }

  if (type === "LIMIT" && !price) {
    res.status(400).json({
      error: "Missing required order fields",
    });
    return;
  }

  const client = await dbPool.connect();
  try {
    //ACID property acting as a draft notebook -> if anything fail inside begin to commit then rollbacck occurs otherwise anything will be only performed after commit is performeed basically storing in buffer and then place into db
    await client.query("BEGIN");
    //Checking available balance & update/lock balance

    //Shared Query required by both type of orders
    const stockQuery = `SELECT id FROM stocks WHERE symbol = $1;`;
    const stockResult = await client.query(stockQuery, [symbol]);

    if (stockResult.rows.length == 0) {
      res.status(404).json({
        error: "Asset Symbol not recognized on this platform data",
      });
      await client.query("ROLLBACK"); //exit from transaction draft
      return;
    }

    const stockId = stockResult.rows[0].id;

    //writing placeholders that universal sync loop below can use
    let systemOrderId = " ";
    let matches: any[] = [];
    const parseQty = parseFloat(qty);

    //Route Branching Mechanism
    if (type === "MARKET") {
      const insertMarketOrder = `
        INSERT INTO orders (user_id,stock_id,price,qty,side,type,status)
        VALUES ($1,$2,$3,$4,$5,$6,'PENDING')
        RETURNING id;
        `;

      const orderDbResult = await client.query(insertMarketOrder, [
        userId,
        stockId,
        0,
        parseQty,
        side,
        type,
      ]);
      systemOrderId = orderDbResult.rows[0].id.toString();
      console.log(`[DEBUG] Market order successfully created in DB with ID: ${systemOrderId}`);

      await client.query("COMMIT"); //commiting early so that engine matching runs outside the block

      //firing market matching directly against current RAM orders
      matches = engine.executeMarketOrder(
        side as "BUY" | "SELL",
        parseQty,
        userId.toString(),
      );
    } else {
      const totalCost = parseFloat(price) * parseFloat(qty);
      //Checking Balance
      const balanceQuery = `
        SELECT total_amount,locked_amount
        FROM balances WHERE user_id= $1;
        `;

      const balanceResult = await client.query(balanceQuery, [userId]);

      if (balanceResult.rows.length === 0) {
        res.status(400).json({
          error: "NO balance record for this user.",
        });
        await client.query("ROLLBACK"); //exit from transaction draft
        return;
      }

      const { total_amount, locked_amount } = balanceResult.rows[0];
      const availableBalance =
        parseFloat(total_amount) - parseFloat(locked_amount);

      if (side === "BUY" && availableBalance < totalCost) {
        res.status(400).json({
          error: "Insufficient balance in user accounts",
        });
        await client.query("ROLLBACK"); //exit from transaction draft
        return;
      }

      //lock balances
      const updateBalanceQuery = `
        UPDATE BALANCES
        SET locked_amount = locked_amount+ $1
        WHERE user_id = $2;
        `;

      await client.query(updateBalanceQuery, [totalCost, userId]);

      //Save the order to our order tracking table in DB
      const insertOrderQuery = `
        INSERT INTO orders (user_id,stock_id,price,qty,side,type)
        VALUES ($1,$2,$3,$4,$5,$6)
        RETURNING id;`;

      const orderDbResult = await client.query(insertOrderQuery, [
        userId,
        stockId,
        price,
        qty,
        side,
        type,
      ]);
      systemOrderId = orderDbResult.rows[0].id.toString();

      await client.query("COMMIT");

      //inititalizing memeory spaces inside engine RAM-> Push order into our in-memory engine RAM books
      engine.initializeUserSpace(userId.toString(), symbol);

      //creating order object for engine
      const newOrder: Order = {
        id: systemOrderId,
        userId: userId.toString(),
        price: parseFloat(price),
        qty: parseFloat(qty),
        filled: 0,
        side: side as "BUY" | "SELL",
        type: type as "LIMIT" | "MARKET",
      };

      if (side == "BUY") {
        engine.bids.push(newOrder);
      } else {
        engine.asks.push(newOrder);
      }

      matches = engine.matchOrders();
    }
    //UNIVERSAL LEDGER SYNCING LOOP(handles results for both types that's why universal )
    console.log(`Total match objects returned from RAM: ${matches.length}`);
    let totalFilledForMarket = 0;
    for (const match of matches) {
      console.log("[MATCHCONTENT]:", JSON.stringify(match));
      const syncClient = await dbPool.connect();
      try {
        await syncClient.query("BEGIN");

        // Replace the old finalBuyerOrderKey / finalSellerOrderKey lines with these safe fallbacks:
        const rawBuyerKey =
          match.buyerOrderId === "MARKET_ORDER"
            ? systemOrderId
            : match.buyerOrderId;
        const rawSellerKey =
          match.sellerOrderId === "MARKET_ORDER"
            ? systemOrderId
            : match.sellerOrderId;

        const finalBuyerOrderKey =
          rawBuyerKey && !isNaN(parseInt(rawBuyerKey, 10))
            ? parseInt(rawBuyerKey, 10)
            : null;
        const finalSellerOrderKey =
          rawSellerKey && !isNaN(parseInt(rawSellerKey, 10))
            ? parseInt(rawSellerKey, 10)
            : null;

        if (
          match.buyerOrderId === "MARKET_ORDER" ||
          match.sellerOrderId === "MARKET_ORDER"
        ) {
          totalFilledForMarket += match.qty;
        }

        const buyerUserId = parseInt(match.buyerId, 10);
        const sellerUserId = parseInt(match.sellerId, 10);
        
        //inserting into trades table
        
        await syncClient.query(
          `INSERT INTO  trades (buyer_id,seller_id,symbol,price,quantity,buyer_order_id,seller_order_id)
                    VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            buyerUserId,
            sellerUserId,
            symbol,
            match.price,
            match.qty,
            finalBuyerOrderKey,
            finalSellerOrderKey,
          ],
        );

        //update the Buyer's row-> no need if the buyer is at the market order
        if (match.buyerOrderId !== "MARKET_ORDER") {
          const buyerStatus = match.buyerFilledAll
            ? "FILLED"
            : "PARTIALLYFILLED";

          await syncClient.query(
            `UPDATE orders SET filled_qty = $1, status = $2 WHERE id = $3`,
            [match.buyerTotalFilled, buyerStatus, finalBuyerOrderKey],
          );
        }

        //updating seller status -> not need for Market_Order
        if (match.sellerOrderId != "MARKET_ORDER") {
          const sellerStatus = match.sellerFilledAll
            ? "FILLED"
            : "PARTIALLYFILLED";

          await syncClient.query(
            `UPDATE orders SET filled_qty = $1, status = $2 WHERE id = $3`,
            [match.sellerTotalFilled, sellerStatus, finalSellerOrderKey],
          );
        }

        await syncClient.query("COMMIT");
        console.log(
          `Order processing saved permanently for IDs: ${match.buyerOrderId} & ${match.sellerOrderId}`,
        );
      } catch (syncError) {
        await syncClient.query("ROLLBACK");
        console.error("CRITICAL SYNC FAULT", syncError);
      } finally {
        syncClient.release();
      }
    }

    if (type === "MARKET") {
      const finalMarketStatus = totalFilledForMarket >= parseQty ? 'FILLED' : (totalFilledForMarket > 0 ? 'PARTIALLY_FILLED' : 'PENDING');

      //Safely parse the orderID falling back to 0 if its empty or invalid
      const marketOrderIdNum =
        systemOrderId && systemOrderId.trim() !== ""
          ? parseInt(systemOrderId, 10)
          : 0;
       
      if(marketOrderIdNum>0) {
    
      const patchClient = await dbPool.connect();
      try {
        await patchClient.query(
          `UPDATE orders SET filled_qty = $1, status = $2 WHERE id = $3`,
          [
            totalFilledForMarket,
            finalMarketStatus,
            parseInt(systemOrderId, 10),
          ],
        );
      } finally {
        patchClient.release();
      }
     } 
    }

    res.status(201).json({
      success: true,
      message: `Order placed via ${type} path.`,
      orderId: systemOrderId,
      matchesExecuted: matches.length,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Gateway Execution failed", error);
    res.status(500).json({
      error: "Internal order gateway failed",
    });
  } finally {
    client.release();
  }
});

export default router;
