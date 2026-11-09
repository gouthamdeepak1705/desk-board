# Benchmark results: pilot

10 runs, 1 models. Prices are unverified third-party figures (see prices.json).

## Overall

| Model | Passed | Accuracy | Median time | Avg steps | Avg tokens in/out | Cost per run | Cost per success | Errors |
|---|---|---|---|---|---|---|---|---|
| gpt-5.6-sol | 9/10 | 90% | 10.0 s | 2.8 | 36075 / 186 | $0.148 | $0.164 | 0 |

## Accuracy by window size

| Model | S100 | S35 |
|---|---|---|
| gpt-5.6-sol | 4/5 (80%) | 5/5 (100%) |

## Accuracy by task group

| Model | A click accuracy | C scrolling | E hard |
|---|---|---|---|
| gpt-5.6-sol | 5/6 | 2/2 | 2/2 |

## Every task (P = pass, F = fail, E = error)

| Task/size | gpt-5.6-sol |
|---|---|
| A1/S100 | P |
| A1/S35 | P |
| A2/S100 | P |
| A2/S35 | P |
| A3/S100 | F |
| A3/S35 | P |
| C1/S100 | P |
| C1/S35 | P |
| E5/S100 | P |
| E5/S35 | P |

## Click accuracy (tasks A, first click)

| Model | First click on target | Median miss (px, on a 1:1 page) | Extra clicks per run |
|---|---|---|---|
| gpt-5.6-sol | 100% | 1 | 1.3 |

## Failures

| Model | Task | Size | Why |
|---|---|---|---|
| gpt-5.6-sol | A3 | S100 | {"pass":false,"firstHit":true,"firstDist":0,"clicks":3} / Clicked the close icon on the notification card. |
