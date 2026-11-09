# Benchmark results: stage1

144 runs, 9 models. Prices are unverified third-party figures (see prices.json).

## Overall

| Model | Passed | Accuracy | Median time | Avg steps | Avg tokens in/out | Cost per run | Cost per success | Errors |
|---|---|---|---|---|---|---|---|---|
| gpt-5.6-terra | 16/16 | 100% | 8.3 s | 2.0 | 21697 / 148 | $0.045 | $0.045 | 0 |
| gpt-6.1-terra | 16/16 | 100% | 8.4 s | 1.9 | 20642 / 87 | $0.042 | $0.042 | 0 |
| gpt-6-sol | 16/16 | 100% | 8.5 s | 1.9 | 20654 / 97 | $0.042 | $0.042 | 0 |
| gpt-5.6-luna | 16/16 | 100% | 8.6 s | 2.0 | 21508 / 134 | $0.0045 | $0.0045 | 0 |
| gpt-5.6-sol | 16/16 | 100% | 9.3 s | 2.1 | 22511 / 131 | $0.093 | $0.093 | 0 |
| gpt-6.1-sol | 16/16 | 100% | 11.9 s | 2.1 | 22252 / 102 | $0.046 | $0.046 | 0 |
| gpt-5.5 | 15/16 | 94% | 9.6 s | 1.9 | 20903 / 133 | $0.109 | $0.116 | 0 |
| gpt-6-luna | 14/16 | 88% | 8.1 s | 1.8 | 18284 / 80 | $0.0019 | $0.0021 | 0 |
| gpt-5.4-mini | 8/16 | 50% | 7.7 s | 3.2 | 50763 / 347 | $0.040 | $0.079 | 0 |

## Accuracy by window size

| Model | S100 | S35 |
|---|---|---|
| gpt-5.6-sol | 8/8 (100%) | 8/8 (100%) |
| gpt-5.6-luna | 8/8 (100%) | 8/8 (100%) |
| gpt-6-luna | 7/8 (88%) | 7/8 (88%) |
| gpt-6-sol | 8/8 (100%) | 8/8 (100%) |
| gpt-6.1-sol | 8/8 (100%) | 8/8 (100%) |
| gpt-5.6-terra | 8/8 (100%) | 8/8 (100%) |
| gpt-6.1-terra | 8/8 (100%) | 8/8 (100%) |
| gpt-5.5 | 8/8 (100%) | 7/8 (88%) |
| gpt-5.4-mini | 4/8 (50%) | 4/8 (50%) |

## Accuracy by task group

| Model | A click accuracy | B Google | C scrolling | D reading | E hard |
|---|---|---|---|---|---|
| gpt-5.6-sol | 6/6 | 2/2 | 4/4 | 2/2 | 2/2 |
| gpt-5.6-luna | 6/6 | 2/2 | 4/4 | 2/2 | 2/2 |
| gpt-6-luna | 5/6 | 2/2 | 3/4 | 2/2 | 2/2 |
| gpt-6-sol | 6/6 | 2/2 | 4/4 | 2/2 | 2/2 |
| gpt-6.1-sol | 6/6 | 2/2 | 4/4 | 2/2 | 2/2 |
| gpt-5.6-terra | 6/6 | 2/2 | 4/4 | 2/2 | 2/2 |
| gpt-6.1-terra | 6/6 | 2/2 | 4/4 | 2/2 | 2/2 |
| gpt-5.5 | 5/6 | 2/2 | 4/4 | 2/2 | 2/2 |
| gpt-5.4-mini | 0/6 | 2/2 | 4/4 | 2/2 | 0/2 |

## Every task (P = pass, F = fail, E = error)

| Task/size | gpt-5.6-sol | gpt-5.6-luna | gpt-6-luna | gpt-6-sol | gpt-6.1-sol | gpt-5.6-terra | gpt-6.1-terra | gpt-5.5 | gpt-5.4-mini |
|---|---|---|---|---|---|---|---|---|---|
| A1/S100 | P | P | P | P | P | P | P | P | F |
| A1/S35 | P | P | P | P | P | P | P | F | F |
| A2/S100 | P | P | F | P | P | P | P | P | F |
| A2/S35 | P | P | P | P | P | P | P | P | F |
| A3/S100 | P | P | P | P | P | P | P | P | F |
| A3/S35 | P | P | P | P | P | P | P | P | F |
| B1/S100 | P | P | P | P | P | P | P | P | P |
| B1/S35 | P | P | P | P | P | P | P | P | P |
| C1/S100 | P | P | P | P | P | P | P | P | P |
| C1/S35 | P | P | P | P | P | P | P | P | P |
| C2/S100 | P | P | P | P | P | P | P | P | P |
| C2/S35 | P | P | F | P | P | P | P | P | P |
| D1/S100 | P | P | P | P | P | P | P | P | P |
| D1/S35 | P | P | P | P | P | P | P | P | P |
| E5/S100 | P | P | P | P | P | P | P | P | F |
| E5/S35 | P | P | P | P | P | P | P | P | F |

## Click accuracy (tasks A, first click)

| Model | First click on target | Median miss (px, on a 1:1 page) | Extra clicks per run |
|---|---|---|---|
| gpt-5.6-sol | 100% | 1 | 0.0 |
| gpt-5.6-luna | 100% | 0 | 0.0 |
| gpt-6-luna | 100% | 1 | 0.0 |
| gpt-6-sol | 100% | 1 | 0.0 |
| gpt-6.1-sol | 83% | 2 | 0.2 |
| gpt-5.6-terra | 100% | 2 | 0.0 |
| gpt-6.1-terra | 100% | 1 | 0.0 |
| gpt-5.5 | 100% | 1 | 0.0 |
| gpt-5.4-mini | 0% | 105 | 5.0 |

## Failures

| Model | Task | Size | Why |
|---|---|---|---|
| gpt-5.4-mini | A1 | S100 | {"pass":false,"firstHit":false,"firstDist":149,"clicks":1,"wrongElements":0} / I clicked the blue “Open report” button. |
| gpt-5.5 | A1 | S35 | {"pass":false,"firstHit":false,"firstDist":null,"clicks":0,"wrongElements":0} / Clicked the blue “Open report” button. |
| gpt-5.4-mini | A1 | S35 | {"pass":false,"firstHit":false,"firstDist":105,"clicks":2,"wrongElements":0} / I clicked the blue “Open report” button on the page. |
| gpt-6-luna | A2 | S100 | {"pass":false,"firstHit":false,"firstDist":null,"clicks":0,"wrongElements":0} / Stopped because of an error: OpenAI 500: {
  "error": {
    "message": "An error |
| gpt-5.4-mini | A2 | S100 | {"pass":false,"firstHit":false,"firstDist":42,"clicks":1,"wrongElements":0} / Done. |
| gpt-5.4-mini | A2 | S35 | {"pass":false,"firstHit":false,"firstDist":null,"clicks":0,"wrongElements":0} / I clicked the red square labeled 7. |
| gpt-5.4-mini | A3 | S100 | {"pass":false,"firstHit":false,"firstDist":101,"clicks":15,"wrongElements":0} / I clicked the red close icon in the notification card’s top-right corner, but th |
| gpt-5.4-mini | A3 | S35 | {"pass":false,"firstHit":false,"firstDist":225,"clicks":11,"wrongElements":0} / I tried clicking the red X in the notification card, but it didn’t close. |
| gpt-6-luna | C2 | S35 | {"pass":false} / Stopped because of an error: OpenAI 500: {
  "error": {
    "message": "An error |
| gpt-5.4-mini | E5 | S100 | {"pass":false,"clicked":""} / I clicked the Download button for Quarterly report 2. |
| gpt-5.4-mini | E5 | S35 | {"pass":false,"clicked":""} / I clicked the Download button for Quarterly report 2. |
