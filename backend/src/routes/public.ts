import {Router ,type Request ,type Response} from 'express';
import { dbPool } from '../config/db.js';
import { engine } from '../engine/orderbook.js';


const router = Router();

//GET: Public Orderbook Depth
router.get('/orderbook/:symbol' , (req:  Request , res: Response)=> {
    const {symbol} =req.params;
    
    if(!symbol){
        res.status(400).json({
            error: "Missing Symbol field is required",
        });
        return;
    }

    //fetching raw bids and asks from the in-memory engine
    const rawBids = engine.bids;
    const rawAsks = engine.asks;

    //Helper function to group orders by price and sum of the remaining quantities
    const aggregateOrders = (orders:any[]) => {
        const depthMap : Record<number, number> = {}; //this stores the totalPrice of the total remainingQty -> helps to publish multiple trade quantity on same price together 

        for(const order of orders){
            const remainingQty = order.qty - order.filled;
            if(remainingQty > 0){
                if(depthMap[order.price] === undefined){
                    depthMap[order.price] = 0;
                }
                depthMap[order.price]! += remainingQty;
            }
        }

        //converting the map back into an array of objects
        return Object.entries(depthMap).map(([price,totalQty])=> ({
            price: parseFloat(price),
            totalQty:  totalQty,
        }));
    };

    //SumUp and sort the liquidity
    //Bids are sorted highest price first
    const aggregateBids = aggregateOrders(rawBids).sort((a,b) => b.price - a.price);

    //asks are  sorted based on lower price first 
    const aggregateAsks = aggregateOrders(rawAsks).sort((a,b) => a.price - b.price); 

    return res.status(200).json({
        symbol,
        bids: aggregateAsks,
        asks: aggregateBids
    });
});

//GET: Public Trade history

router.get('/trades/:symbol',async (req:Request, res: Response) => {
    const {symbol} = req.params;

    if(!symbol){
        res.status(400).json({
            error: "Missing Symbol field is required",
        });
        return;
    }

    const client = await dbPool.connect();
    try {
        await client.query("BEGIN");

        const tradeQuery = `SELECT price, quantity , executed_at
        FROM trades
        WHERE symbol = $1
        ORDER BY executed_at DESC
        LIMIT 50;
        `;

        const tradesResult = await client.query(tradeQuery, [symbol]);

        return res.status(200).json({
            success: true,
            trades: tradesResult.rows
        });
    }catch(error){
        console.error("Error fetching  trades:", error);
        return res.status(500).json({
            error:"Server error fetching trades"
        });
    }finally {
        client.release();
    }
});

export default router;