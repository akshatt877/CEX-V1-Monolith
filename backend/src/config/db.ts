import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load the root .env file here too so dbPool can see the string
dotenv.config({ path: path.resolve(__dirname, '../../../.env') }); // 1st .. indicates go outside src 2nd indicates go outside src 3rd indicates go outside backend and then u will gate env


const {Pool} = pg;

const connectionString = process.env.DATABASE_URL;

if(!connectionString){
    console.error("CRITICAL ERROR : DATABASE_URL environment variable is missing ");
    process.exit(1);
}

export const dbPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl:{
        rejectUnauthorized:true, //Mandated by cloud providers like Neon for encrypted data transfer
    },
    max:10,
    idleTimeoutMillis:30000,
    connectionTimeoutMillis: 10000,
})
/*  this is for when we use locally started databse 
manage reusable db connections effectively
export const dbPool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host : process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'postgres',
    password : process.env.DB_PASSWORD || 'mysecretpassword',
    port : parseInt(process.env.DB_PORT || '5432'),
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
})
*/
dbPool.on('error',(err) => {
    console.error("Unexpected databse error on an idle connection client",err);
    process.exit(-1);
})