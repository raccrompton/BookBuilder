declare module "@lichess-org/stockfish-web" {
  interface StockfishWeb {
    uci(command: string): void; // send uci command, receive async response via listen

    // index arguments are used for dual net sf builds, 0 for big, 1 for small, otherwise ignore

    setNnueBuffer(data: Uint8Array, index?: number): void; // load nnue as buffer

    getRecommendedNnue(index?: number): string; // returns a bare filename

    listen: (data: string) => void; // attach listener here

    onError: (msg: string) => void; // attach error handler here
  }
  export default StockfishWeb;
}
