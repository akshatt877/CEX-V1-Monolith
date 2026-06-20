import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

//Resolving environment vaiables from project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({path : path.resolve(__dirname,'../../.env')});

import  express from 'express';
import cors from 'cors';
import balanceRoutes from './routes/balance.js';

const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors()); //handles middleware
app.use(express.json()); //parses incoming JSON payload

//Mounting application routes
app.use('/api/balances',balanceRoutes);

//Health check route
app.get('/health',(req,res)  => {
    res.status(200).json({
        status: "healthy",timestamp:new Date()
    });
})

/* 🔍 TEMPORARY  DEBUG ROUTE
app.get('/debug/users', async (req, res) => {
    try {
        const { dbPool } = await import('./config/db.js');
        const client = await dbPool.connect();
        
        const queryText = `
        SELECT id,username
        FROM users;
        `; 

        const result = await client.query(queryText);
        client.release();
        
        res.status(200).json(result.rows);
    } catch (error) {
        res.status(500).json({ error: "Debug route failed", details: error });
    }
});
*/
app.listen(PORT, ()=> {
    console.log("NexisCEX Engine Core listening live on the PORT");
})

/*  This was used when we dont have the balance.ts file with the definition of route so at that time we were using core logic to fetch the data now we have defind the route object and defined route in here also so we are removing this  
import {dbPool} from './config/db.js';
import { title } from 'process';

async function verifyInfra(){
    console.log("Starting NexisCEX Core Engine Validation..");
     const client = await dbPool.connect();

     try {
        console.log("Connection pool handshake initiated. Fetching ledger state");

        //Query our seeded user and stock tables using JOIN relational mapping

        const testQuery = `
          SELECT 
            u.username,
            s.symbol,
            b.total_amount,
            b.locked_amount
          FROM balances b
          JOIN users u ON b.user_id = u.id
          JOIN stocks s ON b.asset_id = s.id
          ORDER BY u.username ASC;
        `;

        const result  = await client.query(testQuery);

        console.log("Live Ledger Data Screenshot");
        console.table(result.rows);
        console.log("----------");

        console.log("Infra Validation : Pass");
    }catch(error) {
        console.error("Infra Validation Failed");
        console.error(error);
        process.exit(1);
    }finally{
        client.release();
        console.log("Client safely returned to pool");
        await dbPool.end();
        console.log("Connection pool drained . Process exits cleanly.");
    }
}

verifyInfra();

*/