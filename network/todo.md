# Problems not solve

- [x] Basic functional implementaion and zeromq transport based implementation.

  - [x] basic tests

- Add opentelementry for monitoring/logging

- Add docker + real network benchmark test

- Retry logic - need more carefully track request/response retry in case of node/workspace mises.

- Rate limit logic not implemented, unclear how to manage it now.

- Memory overhelming issues, if ask request too many data per node or final reduce node.

  1. Possible solution implement streaming of responses.
  2. Add limits per workspace request?

- Work on more real life examples. Integrate into platform.

- Not sure if warmup/ping is really needed.
