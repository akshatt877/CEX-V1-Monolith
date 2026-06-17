import dotenv from 'dotenv';
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {dbPool} from "./../config/db.js"; //mandatory .js extension for NodeNext

// Because we are using ES Modules (type: "module"), native __dirname is not available.
// We must reconstruct it manually using the current file's metadata URL.
const __filename = fileURLToPath(import.meta.url);
const __dirname =  path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

async function runMigration(){
    console.log("Starting database Migration lifecycle..");

    //Resolve the absolute file path to your init.sql file
    const sqlScriptPath = path.join(__dirname,'init.sql');

    try {
        //2. Reading the raw text contents of the  SQL script synchronously
        console.log("Reading schema definitions from : ${sqlScriptPath}");
        const sqlQueries = fs.readFileSync(sqlScriptPath,"utf8");

        //3. Request and establish a live client connection from our dbPool
        console.log("Connection to Neon DB instance..");
        const client = await dbPool.connect();


        try {
            //4. fire the entire sql script text directly at the postgres engine
            console.log("Executing DDL tokens and building tables..");
            await client.query(sqlQueries);
            console.log("Migration Successful All core tables an indexes established cleanly");
        }catch(queryError){
            console.error("SQL Exectuion Error encountered mid-migration");
            throw queryError; //rethrow to be caught by outer block
        }finally {
            //Always relese the client back to POOl even if query crashes
            client.release();
            console.log("DB client returned safely back to pool connection stack");
        }
    }catch(error) {
        console.error("Migration lifecycle failed");
        console.error(error);
    }finally {
        //Close the pool completely so that NOdejs terminal p[rocess can exit gracefully]
        await dbPool.end();
        console.log("Connection pool terminated. Execution complete");
    }
}

//firing the runner
runMigration();