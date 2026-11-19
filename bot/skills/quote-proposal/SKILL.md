---
description: Use when turning one or more new quote requests into staged proposals and emailing sales about them.
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
   `historyRefs` quote ids you relied on.
5. **Email sales.** Call `send_sales_email` with:
   - Subject: `Quote proposal <requestId>: <customer>, <quantity> x <product>`
   - Body, plain text:

     ```
     New quote request <requestId> from <customer> (<contact email>).
     Product: <product>  Quantity: <quantity>  Needed by: <date>
     Proposed: <unit price> <currency> each, total <total> <currency>, valid until <date>.
     Basis: <rationale> (history: <quote ids>)
     Customer notes: <notes or "none">
     Staged for review. Reply to approve or adjust before it goes to the customer.
     ```

6. **Record the outcome** for the final reply: staged and emailed, already
   emailed, or needs manual pricing.
