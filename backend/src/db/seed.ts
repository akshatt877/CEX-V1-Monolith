import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

//resolve directory paths for modern ES modules 
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({path : path.resolve(__dirname, '../../../.end') });

import {dbPool} from '../config/db.js';

async function seedDatabase() {
    console.log("Initializing database seeding engine");
    const client = await dbPool.connect();

    try {
        await client.query("BEGIN");

        //clear out  any old seed data and truncate in reverse order of foreign keys
        console.log("Cleaing old table records...");
        await client.query('TRUNCATE TABLE fills,orders,balances,stocks,users CASCADE;');

        //2. SEED MOCK STOCKS/ASSETS
        console.log("Seeding system assets (Stocks)...");
        const stockInsertQuery = `
        INSERT INTO stocks (title,symbol)
        VALUES ($1,$2)
        RETURNING id,symbol;`;

        const btcStock = await client.query(stockInsertQuery, ['Bitcoin','BTC']);
        const hdfcStock = await client.query(stockInsertQuery, ['HDFC Bank','HDFC']);
        const axisStock = await client.query(stockInsertQuery, ['AXIS Bank','AXIS']);

        const btcId = btcStock.rows[0].id;
        const hdfcId = hdfcStock.rows[0].id;
        const axisId = axisStock.rows[0].id;
        
        //3. Seed Mock users(storing dummy hashes for now);
        const userInsertQuery = `
             INSERT INTO users (username,password_hash)
             VALUES ($1,$2)
             RETURNING id,username;
        `;

        const ramanUser = await client.query(userInsertQuery, ['Raman','raman_123']);
        const akshatUser = await client.query(userInsertQuery,['Akshat','akshat_123']);

        const ramanId = ramanUser.rows[0].id;
        const akshatId = akshatUser.rows[0].id;

        //4. Seed initial Balances (the ledger ledger allocations)
        console.log("Allocation inital capital balances...");
        const balanceInsertQuery = `
        INSERT INTO balances (user_id,asset_id,total_amount,locked_amount)
        VALUES ($1,$2,$3,$4);
        `;

        //allocation to raman
        await client.query(balanceInsertQuery,[ramanId,btcId,5.00000000,0.00000000]);
        await client.query(balanceInsertQuery,[ramanId,hdfcId,50000.00000000,0.00000000]);

        //allocation to akshat
        await client.query(balanceInsertQuery,[akshatId,btcId,2.50000000, 0.0000000]);
        await client.query(balanceInsertQuery,[akshatId,axisId,10000.00000000,0.00000000]);

        await client.query('COMMIT');
        console.log("Seeding Successfull! Test environment populated");
    }catch(error) {
        await client.query('ROLLBACK');
        console.error('Seeding transaction failed. DB rolled back to previous state:');
        console.error(error);
    }finally {
        client.release();
        await dbPool.end();
        console.log("Connectio pool closed safely");
    }
}

seedDatabase();
//BEGIN , COMMIT AND ROLLBACK ARE ACID PROPERTIES USED FOR CASES LIKE script successfully creates the assets and users, but crashes right when adding Raman's balance, you don't want a "half-seeded" databas thats why wrapping them into these acid helps to burst the bubble leaving the database clean as if nothing is happened.