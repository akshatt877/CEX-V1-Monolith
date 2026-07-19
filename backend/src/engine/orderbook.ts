export interface Order {
  id: string;
  userId: string;
  price: number;
  qty: number;
  filled: number;
  side: "BUY" | "SELL";
  type: "LIMIT" | "MARKET";
}

export interface AssetBalances {
  [symbol: string]: {
    //using string symbol as the key for fst execution of finding related data to the symbol
    available: number;
    locked: number;
  };
}

export interface UserBalances {
  [userId: string]: AssetBalances;
}

export interface MatchResult {
  buyerOrderId: string;
  sellerOrderId: string;
  buyerId: string;
  sellerId: string;
  price: number;
  qty: number;
  buyerFilledAll: boolean;
  sellerFilledAll: boolean;
  buyerTotalFilled: number;
  sellerTotalFilled: number;
}

export class OrderbookEngine {
  //In memory store tracking active buyer and seller
  //initializes two empty arrays in memoryDb.
  public bids: Order[] = []; //BUY orders with highest price first
  public asks: Order[] = []; //Sell orders with lowest orice first

  //Checking inside in-memory wallet balances for  validation
  public balances: UserBalances = {};

  constructor() {
    console.log("Core Orderbook Engine is initiated in memory");
  }

  //helper to sort books
  public sortBooks(): void {
    this.bids.sort((a, b) => b.price - a.price); //highest buy price first
    this.asks.sort((a, b) => a.price - b.price); //lowest sell price first
  }

  //funnction to initialize the user's wallet space inside RAM cache if not present
  public initializeUserSpace(userId: string, symbol: string) {
    //In JavaScript/TypeScript, you cannot create a nested property if its parent doesn't exist yet. that's why we have 2 if statements
    if (!this.balances[userId]) {
      this.balances[userId] = {};
    }
    if (!this.balances[userId][symbol]) {
      this.balances[userId][symbol] = { available: 0, locked: 0 };
    }
  }

  public matchOrders(): MatchResult[] {
    console.log(
      `[DEBUG] Engine triggered. Bids count: ${this.bids.length}, Asks count: ${this.asks.length}`,
    );
    this.sortBooks();
    const topBidPrice = this.bids[0]?.price ?? "N/A";
    const topAskPrice = this.asks[0]?.price ?? "N/A";

    
    const matches: MatchResult[] = []; //collection array to return to the DB router

    while (
      this.bids.length > 0 &&
      this.asks.length > 0 &&
      this.bids[0] && // TS to check that index 0 exists
      this.asks[0] &&
      this.bids[0].price >= this.asks[0].price //
    ) {
      const bestBid = this.bids[0];
      const bestAsk = this.asks[0];
      if (!bestBid || !bestAsk) {
        return matches;
      }
      const bidRemaining = bestBid.qty - bestBid.filled;
      const askRemaining = bestAsk.qty - bestAsk.filled;

      const matchQuantity = Math.min(bidRemaining, askRemaining);
      const matchPrice = bestAsk.price; //this is for conditions where the ask is 1 BTC for 50$ an the buyer bids for $52 then bid get placed at 50 that's why bestAsk.price is the matchPrice here

      console.log(
        `Match-Found: ${matchQuantity} units esecuted at ${matchPrice}`,
      );

      bestBid.filled += matchQuantity;
      bestAsk.filled += matchQuantity;
      console.log("bestBid structure:", bestBid);
      matches.push({
        buyerOrderId: bestBid.id,
        sellerOrderId: bestAsk.id,
        buyerId: bestBid.userId,
        sellerId: bestAsk.userId,
        price: matchPrice,
        qty: matchQuantity,
        buyerFilledAll: bestBid.filled === bestBid.qty,
        sellerFilledAll: bestAsk.filled === bestAsk.qty,
        buyerTotalFilled: bestBid.filled,
        sellerTotalFilled: bestAsk.filled,
      });

      if (bestBid.filled === bestBid.qty) {
        this.bids.shift(); //removes the first element ($1st place)
      }
      if (bestAsk.filled === bestAsk.qty) {
        this.asks.shift(); // removes first element
      }
    }

    return matches;
  }

  public executeMarketOrder(side:'BUY' | 'SELL', quantity:number, marketUserId: string): MatchResult[] {
    this.sortBooks(); //this sorts Bids in descending order and Asks in ascending order -> which ensures that bestAsk is at this.asks[0]
    const matches: MatchResult[] = [];
    let remainingQty = quantity;

    if(side==='BUY'){
        while(remainingQty>0 && this.asks.length >0&& this.asks[0]){
            const bestAsk = this.asks[0];
            const askRemaining =  bestAsk.qty-bestAsk.filled;
            const matchQuantity = Math.min(remainingQty,askRemaining);

            bestAsk.filled += matchQuantity;
            remainingQty -= matchQuantity;
            matches.push({
                buyerOrderId: 'MARKET_ORDER',
                sellerOrderId: bestAsk.id,
                buyerId: marketUserId,
                sellerId: bestAsk.userId,
                price: bestAsk.price,
                qty:matchQuantity,
                buyerFilledAll: remainingQty === 0,
                sellerFilledAll: bestAsk.filled === bestAsk.qty,
              buyerTotalFilled: quantity - remainingQty,
                sellerTotalFilled: bestAsk.filled
            });

            if(bestAsk.filled === bestAsk.qty) this.asks.shift();
        }
    }else {
        while(remainingQty >0 && this.bids.length >0 && this.bids[0]){
            const bestBid = this.bids[0];
            const bidRemaining = bestBid.qty - bestBid.filled;
            const matchQuantity = Math.min(remainingQty,bidRemaining);

            bestBid.filled += matchQuantity;
            remainingQty -= matchQuantity;

            matches.push({
                buyerOrderId: bestBid.id,
                    sellerOrderId: 'MARKET_ORDER',
                    buyerId: bestBid.userId,
                    sellerId: marketUserId,
                    price: bestBid.price,
                    qty: matchQuantity,
                    buyerFilledAll: bestBid.filled === bestBid.qty,
                    sellerFilledAll: remainingQty === 0,
                    buyerTotalFilled: bestBid.filled,
                    sellerTotalFilled: quantity - remainingQty
            });

            if (bestBid.filled === bestBid.qty) this.bids.shift();
        }
    }

    return matches;

  }
}

//exporting a instance so my whole aplication shares the exact same memory space
export const engine = new OrderbookEngine();
