--schema file 


DROP TABLE IF EXISTS fills CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS balances CASCADE;
DROP TABLE IF EXISTS stocks CASCADE;
DROP TABLE IF EXISTS users CASCADE;

--USERS TABLE 
CREATE TABLE users {
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(256) NOT NULL, --never store raw passwords
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
};

--STOCKS TABLE
 CREATE TABLE stocks (
    id SERIAL PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    symbol VARCHAR(10) UNIQUE NOT NULL --eg AXIS , HDFC, BTC
 )

 --BALANCE TABLE(THE LEDGER) -> To track how much money or stokcs the user holds
  CREATE TABLE balances{
    user_id INT REFERENCES users(id) ON DELETE RESTRICT,
    asset_id INT REFERENCES stocks(id) ON DELETE RESTRICT,
    total_amount NUMERIC(28,8) NOT NULL DEFAULT 0.00000000,
    locked_amount NUMERIC(28,8) NOT NULL DEFAULT 0.00000000, --funds placed in the orders currently
    PRIMARY KEY (user_id,asset_id),  
    /*prevents a user from having two separate BTC balances, which would break my math completely.*/

    --edge cases similar to the base conditions
    CONSTRAINT check_total_positive CHECK (total_amount >=0),
    CONSTRAINT check_locked_positive CHECK (locked_amount >=0),
    CONSTRAINT check_locked_le_total CHECK (total_amount >=locked_amount),
  }

  --ORDERS TABLE
  CREATE TABLE orders{
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    stock_id INT REFERENCES stocks(id) ON DELETE CASCADE,
    side VARCHAR(4) NOT NULL CONSTRAINT check_order_side CHECK (side IN ('BUY', 'SELL')),
    type VARCHAR(6) NOT NULL CONSTRAINT check_order_type CHECK (type IN ('LIMIT','MARKET')),
    price NUMERIC(28,8) NOT NULL,
    qty NUMERIC(28,8) NOT NULL,
    filed_qty NUMERIC(28,8) NOT NULL DEFAULT 'PENDING',
    status VARCHAR(20) not null DEFAULT 'PENDING' 
          CONSTRAINT check_order_status CHECK (status IN('PENDING','PARTIALLY_FILLED', 'FILLED', 'CANCELLED'));
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT check_qty_positive CHECK (qty>0),
    CONSTRAINT N check_filled_qty CHECK (filled_qty <=qty)
  };

  --FILLS /TRADES TABLE (IMMUTABLE EXECUTION HISTORY)
  CREATE TABLE fills {
    id SERIAL PRIMARY KEY,
    stock_id INT_REFERENCES stocks(id) ON DELETE RESTRICT,
    price NUMERIC (28,8) NOT NULL,
    qty NUMERIC(28,8) NOT NULL,
    buy_order_id INT REFERENCES orders(id) ON DELETE RESTRICT,
    sell_order_id INT REFERENCES orders(id) ON DELETE RESTRICT,
    executed_at TIMESTAMP WITH TIME ZONE CURRENT_TIMESTAMP,
  };

  --DATABASE INDEX FOR SPEED
  --Prevents slow  linear table scans when looking up data
  CREATE INDEX idx_orders_user ON orders(user_id); --making an index for user_id inside orders table 
  CREATE INDEX idx_orders_status ON orders(status);
  CREATE INDEX idx_fills_stock ON fills(stock_id);

