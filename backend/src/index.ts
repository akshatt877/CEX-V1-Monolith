import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

//Resolving environment vaiables from project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({path : path.resolve(__dirname,'../../.env')});

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

