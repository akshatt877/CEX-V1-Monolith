import pg from 'pg';
const {Pool} = pg;

const connectionString = process.env.DATABASE_URL;

if(!connectionString){
    console.error("CRITICAL ERROR : DATABASE_URL environment variable is missing ");
    process.exit(1);
}

export const dbPool = new Pool({
    connectionString: "postgresql://neondb_owner:npg_LdbUhYq68SVZ@ep-long-wind-addqcltl.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
    ssl:{
        rejectUnauthorized:true, //Mandated by cloud providers like Neon for encrypted data transfer
    },
    max:10,
    idleTimeoutMillis:30000,
    connectionTimeoutMillis: 2000,
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