import { useMemo } from 'react';
import {
  CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import type { YearRow } from '../../engine/types';

interface Props {
  years: YearRow[];
  firstShortfallAge: number | null;
  isPortfolioDriven: boolean;
}

const pounds = (value: number) => `£${Math.round(value).toLocaleString('en-GB')}`;

export function buildIncomeGoalData(years: YearRow[]) {
  return years.map(year => ({
    age: year.age,
    net: year.net_income_achieved,
    target: year.target_net,
  }));
}

export default function IncomeGoalChart({ years, firstShortfallAge, isPortfolioDriven }: Props) {
  const data = useMemo(() => buildIncomeGoalData(years), [years]);
  const ageTicks = data.filter((_, index) => index % 10 === 0 || index === data.length - 1).map(row => row.age);
  const comparison = isPortfolioDriven ? 'Strategy-derived spending estimate' : 'Income target';

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 sm:p-6" aria-labelledby="income-goal-title">
      <h2 id="income-goal-title" className="text-lg font-semibold text-gray-900">
        Projected net income against {isPortfolioDriven ? 'strategy-derived spending' : 'your target'}
      </h2>
      <p className="text-sm text-gray-600 mt-1 mb-4">
        Annual amounts in £. {isPortfolioDriven ? 'The comparison line follows the spending rule, not your separate planning benchmark.' : 'Based on current plan assumptions, not guaranteed income.'}
      </p>
      {data.length === 0 ? (
        <p className="text-sm text-gray-600">No annual projection to chart. Check your plan inputs.</p>
      ) : (
        <>
          <div className="h-72 sm:h-80" role="img" aria-label={`Income chart by age. Projected net income compared with ${comparison.toLowerCase()}.${firstShortfallAge === null ? ' No shortfall in the plan summary.' : ` First shortfall at age ${firstShortfallAge}.`} Year-by-year figures are available below.`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 15, right: 22, bottom: 14, left: 12 }}>
                <CartesianGrid stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="age" type="number" domain={['dataMin', 'dataMax']} ticks={ageTicks} interval={0} tick={{ fontSize: 12 }} label={{ value: 'Age', position: 'insideBottom', offset: -10 }} />
                <YAxis width={67} tick={{ fontSize: 12 }} tickFormatter={v => `£${Math.round(v / 1000)}k`} />
                <Tooltip labelFormatter={age => `Age ${age}`} formatter={(value: number, name: string) => [pounds(value), name === 'net' ? 'Projected net income' : comparison]} />
                <Line dataKey="net" name="net" type="linear" stroke="#0f766e" strokeWidth={3} dot={false} activeDot={{ r: 5 }} isAnimationActive={false} />
                <Line dataKey="target" name="target" type="linear" stroke="#9a6700" strokeWidth={2} strokeDasharray="7 5" dot={false} activeDot={{ r: 5 }} isAnimationActive={false} />
                {firstShortfallAge !== null && <ReferenceLine x={firstShortfallAge} stroke="#b45309" strokeDasharray="3 4" />}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-700 mt-2" aria-hidden="true">
            <span><span className="inline-block w-5 border-t-[3px] border-teal-700 mr-2 align-middle" />Projected net income</span>
            <span><span className="inline-block w-5 border-t-2 border-dashed border-amber-700 mr-2 align-middle" />{comparison}</span>
          </div>
          <p className="text-xs text-gray-600 mt-3">Use the Year-by-Year Breakdown below for exact values and tax detail.</p>
        </>
      )}
    </section>
  );
}
