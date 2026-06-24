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
    
     //helper to sort books
    public sortBooks():void {
        this.bids.sort((a,b)=> b.price -a.price); //highest buy price first
        this.asks.sort((a,b)=>a.price-b.price); //lowest sell price first
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

    public matchOrders(): void {
        console.log(`[DEBUG] Engine triggered. Bids count: ${this.bids.length}, Asks count: ${this.asks.length}`);
    if (this.bids[0] || this.asks[0]) {
        console.log(`[DEBUG] Top Bid Price: ${this.bids[0]?.price} (Type: ${typeof this.bids[0]?.price}), Top Ask Price: ${this.asks[0]?.price} (Type: ${typeof this.asks[0]?.price})`);
    }
    
        this.sortBooks();

        while(
            this.bids.length >0 &&
            this.asks.length >0 &&
            this.bids[0] && // TS to check that index 0 exists
            this.asks[0] && 
            this.bids[0].price >=this.asks[0].price //
        ){
            const bestBid = this.bids[0];
            const bestAsk = this.asks[0]; 
            if(!bestBid || !bestAsk) {
                return;
            }
            const bidRemaining = bestBid.qty - bestBid.filled;
            const askRemaining = bestAsk.qty - bestAsk.filled;

            const matchQuantity = Math.min(bidRemaining,askRemaining);
            const matchPrice = bestAsk.price; //this is for conditions where the ask is 1 BTC for 50$ an the buyer bids for $52 then bid get placed at 50 that's why bestAsk.price is the matchPrice here 

            console.log(`Match-Found: ${matchQuantity} units esecuted at ${matchPrice}`);

            bestBid.filled += matchQuantity;
            bestAsk.filled += matchQuantity;
            
            if(bestBid.filled === bestBid.qty){
                this.bids.shift(); //removes the first element ($1st place)
            }
            if(bestAsk.filled === bestAsk.qty){
                this.asks.shift(); // removes first element 
            }
        }
    }
}

//exporting a instance so my whole aplication shares the exact same memory space
export const engine = new OrderbookEngine();