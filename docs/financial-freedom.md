# Financial freedom model

The planner lives under Goals. Each account saves one plan with a common target
and two contribution scenarios. The target summary comes first, and the scenario
fields appear side by side on wide screens so the assumptions and estimated dates
can be compared. The planner uses the dashboard's existing typography, colors,
spacing, and focus styles.

## Model design

No financial rates are prefilled. The user supplies an annual withdrawal rate,
gross nominal investment return, an annual fees and taxes drag in percentage
points, inflation, and annual growth in nominal monthly contributions. The
withdrawal rate determines the capital target. The planner models accumulation
through the first month that reaches the target.

Amounts use the purchasing power of the calculation date and a single currency.
The real capital target is annual spending divided by the withdrawal rate as a
fraction. The initial gap is the target minus eligible investable assets, floored
at zero. An already funded target is reached on the calculation date.

For month `m`, the balance earns the monthly equivalent of the annual nominal
return after subtracting fees and taxes. A contribution is added at month end,
with its nominal amount adjusted after each 12 contributions. The resulting
balance is expressed in calculation-date purchasing power. Equivalently:

```text
I = (1 + annual inflation) ^ (1/12)
R = (1 + annual gross return - annual drag) ^ (1/12)
contribution(m) = first monthly contribution * (1 + growth) ^ floor((m - 1)/12)
real balance(m) = real balance(m - 1) * R / I + contribution(m) / I^m
```

The model uses constant assumptions over 600 months. It estimates the first
crossing at monthly intervals. Fees and taxes are a single assumed return drag.
Actual returns, spending, and tax costs may vary. Estimates are planning
illustrations and dates carry no guarantee.

The model uses monthly compounding and periodic deposits as described by the
[SEC compound interest calculator](https://www.investor.gov/financial-tools-calculators/calculators/compound-interest-calculator).
Deflating nominal values follows the
[BLS constant-dollar method](https://www.bls.gov/cpi/factsheets/purchasing-power-constant-dollars.htm).
The [SEC fees bulletin](https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins/updated)
describes the effect of ongoing costs on returns.

## Spending and saved inputs

The optional transaction baseline sums same-currency expenses over the last
12 completed calendar months. It requires at least one recorded expense in each
month and excludes transfers, income, and deleted transactions. Each user
explicitly accepts the amount and period. Manual spending is available with any
amount of history. Historical expenses are summed as recorded. Accepting them
uses that sum as the planning amount in calculation-date purchasing power.

The planner automatically previews active Net worth balances in the selected
currency. Only assets classified as investable contribute to the suggested
funded amount. Emergency reserves and liabilities appear alongside it for
context. Primary residences and other asset classes stay outside the funding
calculation. Goal balances are not added again. Users can copy the tracked
investable total or enter an amount manually. A copy is an input snapshot
that stays fixed as valuations change.

The owner-scoped plan stores the spending amount and accepted period, entered
assets, scenario assumptions, currency, and calculation date together. Subsequent
transaction and valuation changes leave the stored inputs intact. The planner
only writes to the financial freedom plans table. The table can be retained when
rolling back the frontend so saved plans remain available on redeployment.
