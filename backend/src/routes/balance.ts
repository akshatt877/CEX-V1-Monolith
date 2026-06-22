import {Router,type Request,type Response} from 'express';
import {dbPool} from '../config/db.js';

const router = Router();

//route to get balances
router.get('/:userId', async(req: Request, res:Response):Promise<void> => {
    const{userId} = req.params;
    const client = await dbPool.connect();

    try {
        const queryText = `
          SELECT s.symbol, b.total_amount,b.locked_amount
          FROM balances b
          JOIN stocks s ON b.asset_id = s.id
          WHERE b.user_id = $1;
          `;

          const values = [userId];

          const result = await client.query(queryText,values);

          if(result.rows.length==0){
            res.status(404).json({
                error: "No balances found for this user id "
            });
            return ;
          }

          res.status(200).json({
            success: true,
            userId,
            balances: result.rows
          });
    } catch(error) {
        console.error("Error fetching balances from database",error);
        res.status(500).json({error: "Internal server security or db error"});
    }finally {
      client.release();
      console.log("DB connection returned to POOL");
    }
});

export default router;