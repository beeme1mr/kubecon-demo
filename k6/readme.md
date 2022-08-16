# K6 Tests

Run a simple smoke test with:

```shell
k6 run -e BASE_URL=http://localhost:30000 --duration 10s --vus 1 calculate.js
```
