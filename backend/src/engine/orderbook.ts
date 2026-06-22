export interface Order {
    id: string;
    userId: string;
    price: number;
    qty: number;
    filled: number;
    side: 'BUY' | 'SELL';
    type: 'LIMIT'| 'MARKET';
}

export interface AssetBalances{
    [symbol:string]: { //using string symbol as the key for fst execution of finding related data to the symbol 
        available: number;
        locked:number;
    };
}

export interface UserBalances {
    [userId:string] : AssetBalances;
}

export class OrderbookEngine {
    //In memory store tracking active buyer and seller
    //initializes two empty arrays in memoryDb.
    public bids: Order[]= []; //BUY orders with highest price first
    public asks: Order[]=[] //Sell orders with lowest orice first 

    //Checking inside in-memory wallet balances for  validation
    public balances : UserBalances = {};

    constructor() {
        console.log("Core Orderbook Engine is initiated in memory");
    }

    //funnction to initialize the user's wallet space inside RAM cache if not present
    public initializeUserSpace(userId:string, symbol:string) {
    //In JavaScript/TypeScript, you cannot create a nested property if its parent doesn't exist yet. that's why we have 2 if statements
        if(!this.balances[userId]) {
            this.balances[userId] = {};
        }
        if(!this.balances[userId][symbol]){
            this.balances[userId][symbol] = {available:0,locked:0};
        }
    }
}

//exporting a instance so my whole aplication shares the exact same memory space
export const engine = new OrderbookEngine();