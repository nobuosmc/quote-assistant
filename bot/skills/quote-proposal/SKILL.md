---
description: Use when turning one or more new quote requests into staged proposals on the proposals sheet.
---

# Quote proposal

Do these steps for each request id. Finish one request before you start the next.

1. **Load the request.** Use the row from `list_quote_requests`. Note the
   customer, product, quantity, needed-by date, and notes.
2. **Read history.** Call `read_quote_history` twice:
   - `customer` + `product`: this customer's past prices for this product.
   - `product` only: what other customers paid.
3. **Pick a unit price.**
   - Prefer this customer's most recent **Won** quote for the product.
   - Else use the median of recent Won quotes for the product.
   - Quantity at or above the largest past Won quantity: you may go down to that
     quote's unit price, never lower.
   - Quantity well below past quantities: lean toward the higher past prices.
   - No Won quotes for the product: do not stage. Report "needs manual pricing".
4. **Stage.** Call `stage_quote_proposal` with one line item, the unit price,
   `validUntil` 30 days from today, a one-to-two sentence `rationale`, and the
   `historyRefs` quote ids you relied on. The tool writes one proposals-sheet
   row for this Request ID (a repeat updates that row) and sets the intake
   status. Do not write the sheet yourself.
5. **Record the outcome** for the final reply: staged (created or updated), or
   needs manual pricing. If the tool result says `target: "mock"`, say that
   sample data was used.
