import {Router, type Request,type  Response}  from 'express';
import {dbPool} from '../config/db.js';
import{engine,type Order}  from '../engine/orderbook.js';
import crypto from 'crypto';

const router = Router();

//POST /api/orders
router.post('/', async(req:Request, res: Response): Promise<void> =>  {
    const {userId,symbol,price,qty,side,type}=  req.body;

    if(!userId || !symbol || !price || !qty || !side ||!type) {
        res.status(400).json({
            error: "Missing required order placement fields."
        });
        return;
    }

    const totalCost = parseFloat(price)*parseFloat(qty)
    const client = await dbPool.connect();
    try {
        //ACID property acting as a draft notebook -> if anything fail inside begin to commit then rollbacck occurs otherwise anything will be only performed after commit is performeed basically storing in buffer and then place into db 
        await client.query('BEGIN');
     //Checking available balance & update/lock balance

        const balanceQuery = `
        SELECT total_amount,locked_amount
        FROM balances WHERE user_id= $1;
        `;

        const balanceResult = await client.query(balanceQuery,[userId]);

        if(balanceResult.rows.length === 0){
            res.status(400).json({
                error: "NO balance record for this user."
            });
            await client.query('ROLLBACK'); //exit from transaction draft
            return;
        }

        const {total_amount,locked_amount} = balanceResult.rows[0];
        const availableBalance = parseFloat(total_amount)-parseFloat(locked_amount);

        if(side === 'BUY' && availableBalance < totalCost){
            res.status(400).json({
                error:"Insufficient balance in user accounts"
            });
            await client.query('ROLLBACK'); //exit from transaction draft
            return ;
        }

        const updateBalanceQuery = `
        UPDATE BALANCES
        SET locked_amount = locked_amount+ $1
        WHERE user_id = $2;
        `;

        await client.query(updateBalanceQuery,[totalCost,userId]);
      
      //Now placing the order because we have updated the balance above 
        const stockQuery = `SELECT id FROM stocks WHERE symbol = $1;`;
        const stockResult = await client.query(stockQuery,[symbol]);

        if(stockResult.rows.length==0) {
            res.status(404).json({
                error: "Asset Symbol not recognized on this platform data"
            });
            await client.query('ROLLBACK'); //exit from transaction draft
            return;
        }

        const stockId = stockResult.rows[0].id;

        //Save the order to our order tracking table in DB
        const insertOrderQuery = `
        INSERT INTO orders (user_id,stock_id,price,qty,side,type)
        VALUES ($1,$2,$3,$4,$5,$6)
        RETURNING id;`;

        const orderDbResult = await client.query(insertOrderQuery,[userId,stockId,price,qty,side,type]);
        const systemOrderId = orderDbResult.rows[0].id.toString();

        await client.query('COMMIT');

        //inititalizing memeory spaces inside engine RAM-> Push order into our in-memory engine RAM books
        engine.initializeUserSpace(userId.toString(),symbol);

        //creating order object for engine
        const newOrder : Order =  {
            id:systemOrderId,
            userId: userId.toString(),
            price: parseFloat(price),
            qty: parseFloat(qty),
            filled:0,
            side: side as 'BUY' | 'SELL',
            type: type as 'LIMIT' | 'MARKET'
        };

        if(side == 'BUY'){
            engine.bids.push(newOrder);
        }else {
            engine.asks.push(newOrder);
        }

        const matches= engine.matchOrders();
        
        console.log(`Total match objects returned from RAM: ${matches.length}`);

        for(const match of matches) {
            console.log("[MATCHCONTENT]:", JSON.stringify(match));
            const syncClient = await dbPool.connect();
            try {
                await syncClient.query('BEGIN');

                const buyerUserId = parseInt(match.buyerId, 10);
               const sellerUserId = parseInt(match.sellerId, 10);
              const buyerOrderKey = parseInt(match.buyerOrderId, 10);
             const sellerOrderKey = parseInt(match.sellerOrderId, 10);

                await syncClient.query (
                    `INSERT INTO  trades (buyer_id,seller_id,symbol,price,quantity,buyer_order_id,seller_order_id)
                    VALUES ($1,$2,$3,$4,$5,$6,$7)`,
                    [buyerUserId, sellerUserId, symbol, match.price, match.qty, buyerOrderKey, sellerOrderKey]
                );

                //update the Buyer's row
                const buyerStatus = match.buyerFilledAll ? 'FILLED' :'PARTIALLYFILLED';

                await syncClient.query(
                    `UPDATE orders SET filled_qty = $1, status = $2 WHERE id = $3`,
                    [match.buyerTotalFilled, buyerStatus, buyerOrderKey]
                );

                const sellerStatus = match.sellerFilledAll ? 'FILLED' :'PARTIALLYFILLED';

                await syncClient.query(
                    `UPDATE orders SET filled_qty = $1, status = $2 WHERE id = $3`,
                    [match.sellerTotalFilled, sellerStatus, sellerOrderKey]
                );

                await syncClient.query('COMMIT');
                console.log(`Order processing saved permanently for IDs: ${match.buyerOrderId} & ${match.sellerOrderId}`);
            } catch(syncError) {
                await syncClient.query('ROLLBACK');
                console.error('Failed to lock down matching records',syncError);
            } finally {
                syncClient.release();
            }
        }

        res.status(201).json({
            success: true,
            message: 'Order placed Successfully onto the books',
            order: newOrder
        });
    }catch(error) {
        await client.query('ROLLBACK');
        console.error("Transaction  failed! Changes rolled back safely",error);
        res.status(500).json({
            error: "Internal order gateway failed"
        });
    }finally {
        client.release();
    }
});

export default router;
