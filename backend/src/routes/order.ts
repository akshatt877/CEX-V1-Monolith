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

    const client = await dbPool.connect();

    try{
        const stockQuery = `SELECT id FROM stocks WHERE symbol = $1;`;
        const stockResult = await client.query(stockQuery,[symbol]);

        if(stockResult.rows.length==0) {
            res.status(404).json({
                error: "Asset Symbol not recognized on this platform data"
            });
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

        //inititalizing memeory spaces inside engine RAM
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

        res.status(201).json({
            success: true,
            message: 'Order placed Successfully onto the books',
            order: newOrder
        });
    }catch(error) {
        console.error("Exception thrown during order submission processinging",error);
        res.status(500).json({
            error: "Internal order gateway failed"
        });
    }finally {
        client.release();
    }
});

export default router;
