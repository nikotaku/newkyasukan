// 運営側の収支シミュレーター。
// 売上は「掲載店舗数 × 平均掲載料（定額）」だけで立てる。入店人数やセラピストの売上に連動する
// 成果報酬・スカウトバックは法律上の問題があるため、このモデルには入れない（README 参照）。

export interface SimInput {
  adSpend: number; // 月の広告費（セラピスト集客）
  cpa: number; // 1登録あたりの広告費
  organic: number; // 紹介・SNSなど広告以外の登録（月）
  interviewRate: number; // 登録 → コーチ面談 (0〜1)
  joinRate: number; // 面談 → 入店 (0〜1)
  retention: number; // 在籍セラピストが翌月も続ける割合 (0〜1)
  coachingMonths: number; // 入店後にコーチが伴走する月数
  storesStart: number; // 開始時の掲載店舗数
  storesNewPerMonth: number; // 毎月増える掲載店舗
  storeChurn: number; // 掲載店舗の月間解約率 (0〜1)
  avgFee: number; // 1店舗あたりの平均掲載料（月）
  coachCost: number; // コーチ1人の月額費用
  coachCapacity: number; // コーチ1人が同時に担当できる人数
  fixedCost: number; // システム・AI・事務・家賃など
  months: number;
}

export const DEFAULT_SIM_INPUT: SimInput = {
  adSpend: 600000,
  cpa: 12000,
  organic: 10,
  interviewRate: 0.6,
  joinRate: 0.35,
  retention: 0.85,
  coachingMonths: 3,
  storesStart: 10,
  storesNewPerMonth: 4,
  storeChurn: 0.05,
  avgFee: 50000,
  coachCost: 300000,
  coachCapacity: 25,
  fixedCost: 200000,
  months: 24,
};

export interface SimMonth {
  month: number; // 1始まり
  registrations: number;
  interviews: number;
  joins: number;
  activeTherapists: number; // 在籍しているセラピスト（累計・継続率込み）
  coachingLoad: number; // コーチが担当している人数（面談中＋伴走期間中）
  coaches: number;
  stores: number;
  revenue: number;
  adCost: number;
  coachCostTotal: number;
  fixedCost: number;
  cost: number;
  profit: number;
  cumulativeProfit: number;
  joinsPerStore: number; // 1店舗あたりの月間入店数（店舗にとっての価値）
}

export interface SimSummary {
  months: SimMonth[];
  last: SimMonth;
  breakEvenMonth: number | null; // 月次で黒字になった最初の月
  paybackMonth: number | null; // 累積で黒字になった最初の月
  worstCumulative: number; // 累積赤字の底（必要な運転資金の目安）
  costPerJoin: number; // 1入店あたりの獲得コスト（広告＋コーチ）
  breakEvenStores: number; // 最終月の費用をまかなうのに必要な掲載店舗数
}

const clampRatio = (value: number) => Math.min(1, Math.max(0, value));

export function simulate(input: SimInput): SimSummary {
  const months: SimMonth[] = [];
  const retention = clampRatio(input.retention);
  const churn = clampRatio(input.storeChurn);
  const capacity = Math.max(1, input.coachCapacity);
  const joinsHistory: number[] = [];
  let active = 0;
  let stores = input.storesStart;
  let cumulative = 0;

  for (let month = 1; month <= Math.max(1, Math.floor(input.months)); month++) {
    if (month > 1) stores = stores * (1 - churn) + input.storesNewPerMonth;

    const registrations = (input.cpa > 0 ? input.adSpend / input.cpa : 0) + input.organic;
    const interviews = registrations * clampRatio(input.interviewRate);
    const joins = interviews * clampRatio(input.joinRate);
    joinsHistory.push(joins);
    active = active * retention + joins;

    // 伴走期間中の人数：直近 coachingMonths か月の入店者のうち、まだ続けている人
    let coached = 0;
    for (let age = 0; age < input.coachingMonths && age < joinsHistory.length; age++) {
      coached += joinsHistory[joinsHistory.length - 1 - age] * retention ** age;
    }
    const coachingLoad = interviews + coached;
    const coaches = Math.max(1, Math.ceil(coachingLoad / capacity));

    const revenue = stores * input.avgFee;
    const coachCostTotal = coaches * input.coachCost;
    const cost = input.adSpend + coachCostTotal + input.fixedCost;
    const profit = revenue - cost;
    cumulative += profit;

    months.push({
      month,
      registrations,
      interviews,
      joins,
      activeTherapists: active,
      coachingLoad,
      coaches,
      stores,
      revenue,
      adCost: input.adSpend,
      coachCostTotal,
      fixedCost: input.fixedCost,
      cost,
      profit,
      cumulativeProfit: cumulative,
      joinsPerStore: stores > 0 ? joins / stores : 0,
    });
  }

  const last = months[months.length - 1];
  const breakEven = months.find((m) => m.profit >= 0);
  const payback = months.find((m) => m.cumulativeProfit >= 0);
  const worstCumulative = Math.min(0, ...months.map((m) => m.cumulativeProfit));
  const totalJoins = months.reduce((sum, m) => sum + m.joins, 0);
  const totalAcquisition = months.reduce((sum, m) => sum + m.adCost + m.coachCostTotal, 0);

  return {
    months,
    last,
    breakEvenMonth: breakEven ? breakEven.month : null,
    paybackMonth: payback ? payback.month : null,
    worstCumulative,
    costPerJoin: totalJoins > 0 ? totalAcquisition / totalJoins : 0,
    breakEvenStores: input.avgFee > 0 ? Math.ceil(last.cost / input.avgFee) : Infinity,
  };
}
