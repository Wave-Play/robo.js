# Benchmarks

We use [k6](https://k6.io) to benchmark this plugin against Express and Fastify. Our `script.js` benchmark is meant to simulate a low-traffic production environment, while `stress.js` simulates big traffic spikes.

## Pre-requisites

k6 requires Go to run. You can install it from [golang.org](https://golang.org). Of course, you'll also need to install k6 itself from [k6.io](https://k6.io). Finally, you'll need to install xk6, a tool that allows you to use k6 plugins. You can install it with `go install go.k6.io/xk6/cmd/xk6@latest`.

## Running the benchmarks

Because we use xk6, you'll need to build the plugin before running the benchmarks. To do so, run `xk6 build --with github.com/szkiba/xk6-dashboard@latest`. This will create a `k6` executable in the current directory. The current executable was built for macOS.

Once you've built the plugin, you can run the benchmarks with:

```bash
./k6 run --out dashboard script.js
```

To run the stress test, use:

```bash
./k6 run --out dashboard stress.js
```

## Visualizing the results

We use [xk6-dashboard](https://github.com/grafana/xk6-dashboard) to visualize the results. You can access the dashboard at [127.0.0.1:5665](http://127.0.0.1:5665) while the benchmark is running.
