# Volatility-scaled persistence — polymarket-nvidia-ceo-forecast-01

Forecasts each market's Yes price 240 minutes ahead as a band around its last
price, widening with the square root of time. The band's width is each
market's own recent realized volatility (a fast 20-minute window mixed with a
slow 240-minute one), not one sigma for every market — the pinball loss
rewards narrow bands on quiet markets and wide ones on jumpy markets.

`main.ts` reads every `*.in` case in the input directory and writes the
matching `*.out` forecast file: for every market, 240 rows of the 0.05, 0.25,
0.5, 0.75 and 0.95 quantiles. Node 22, standard library only, no network, no
clock, no randomness: two runs are byte-identical.

Run it outside the grader:

```
mkdir -p out && MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
```

On the six practice cases it scores a mean pinball loss of 0.0382 against the
house baseline's 0.3636 (tuned on the first three cases, checked on the last
three; the practice replaces the baseline's one-sigma-for-everyone with each
market's measured step size).
