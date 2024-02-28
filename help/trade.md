**Trade Commands**
~~--------------------~~
**`{prefix}trade [amount] [symbol/guid] for [amount] [symbol/guid] with @user`** Creates a trade for the given tokens with the specified user. The trade will be cancelled after {config.tradeTime} minutes.

**`{prefix}accept [trade ID]`** Accepts the trade with the given trade ID.

**`{prefix}cancel [trade ID]`** Cancels the trade with the given trade ID.

**`{prefix}recent <symbol/guid>`** Lists some recent trades. Symbol/guid is optional; if included the list will only show trades with those tokens.
