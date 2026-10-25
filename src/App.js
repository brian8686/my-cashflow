import React, { useState, useMemo, useEffect } from "react";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
  onAuthStateChanged,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  onSnapshot,
  collection,
} from "firebase/firestore";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

// 這是您專屬的 Firebase 金鑰設定 (已為您串接)
const myFirebaseConfig = {
  apiKey: "AIzaSyC9XWi8hb0RVny1iHDiClurHZ2KaLU4LLg",
  authDomain: "mycashflowapp-340b2.firebaseapp.com",
  projectId: "mycashflowapp-340b2",
  storageBucket: "mycashflowapp-340b2.firebasestorage.app",
  messagingSenderId: "796551841252",
  appId: "1:796551841252:web:1957a38de68687ef0933f1",
  measurementId: "G-C68NN1T4C5",
};

// 自動判斷環境：如果您將程式碼貼到 StackBlitz 或本機，就會自動使用您的專屬金鑰
const firebaseConfig =
  typeof __firebase_config !== "undefined"
    ? JSON.parse(__firebase_config)
    : myFirebaseConfig;
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== "undefined" ? __app_id : "mycashflowapp";

// ==========================================
// 核心應用程式組件
// ==========================================
export default function CashflowApp() {
  // --- 基本設定與貸款狀態 ---
  const [age, setAge] = useState(30);
  const [mortgageCalc, setMortgageCalc] = useState({
    principal: 1000,
    years: 30,
    rate: 2.15,
  });
  const [creditCalc, setCreditCalc] = useState({
    principal: 100,
    years: 7,
    rate: 3.5,
  });

  // --- 資產狀態 (單位：萬元) ---
  const [assets, setAssets] = useState({
    cash: 30,
    stocksRegular: 100,
    stocksLeveraged: 0,
    funds: 0,
    futures: 0,
    houseValue: 1500,
    mortgageBalance: 1000,
  });

  // --- 收支明細狀態 ---
  const [incomes, setIncomes] = useState([
    {
      id: 1,
      name: "本業薪資",
      amount: 90000,
      isPassive: false,
      color: "#3b82f6",
    },
    {
      id: 2,
      name: "股息收益",
      amount: 15000,
      isPassive: true,
      color: "#3b82f6",
    },
  ]);

  const [expenses, setExpenses] = useState([
    { id: 3, name: "房貸(一胎)", amount: 35000, color: "#ef4444" },
    { id: 32, name: "房貸(二胎)", amount: 0, color: "#ef4444" },
    { id: 31, name: "信貸", amount: 0, color: "#ef4444" },
    { id: 4, name: "變動生活支出", amount: 25000, color: "#ef4444" },
    { id: 5, name: "固定與年度攤提", amount: 15000, color: "#ef4444" },
  ]);

  const [newItem, setNewItem] = useState({
    type: "income",
    name: "",
    amount: "",
    isPassive: false,
  });

  // --- 雲端儲存與歷史紀錄狀態 ---
  const [user, setUser] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [isSaving, setIsSaving] = useState(false);

  // 1. 初始化登入狀態
  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== "undefined" && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. 監聽使用者的雲端歷史紀錄
  useEffect(() => {
    if (!user) return;
    const historyRef = collection(
      db,
      "artifacts",
      appId,
      "users",
      user.uid,
      "history"
    );
    const unsubscribe = onSnapshot(
      historyRef,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        data.sort((a, b) => a.id.localeCompare(b.id)); // 依照月份字串排序 (ex: 2026-09, 2026-10)
        setHistoryData(data);
      },
      (error) => {
        console.error("讀取歷史紀錄失敗:", error);
      }
    );
    return () => unsubscribe();
  }, [user]);

  // 本息均攤計算公式
  const calcPMT = (principal, years, rate) => {
    const p = (Number(principal) || 0) * 10000;
    const r = (Number(rate) || 0) / 100 / 12;
    const n = (Number(years) || 0) * 12;
    if (p <= 0 || n <= 0) return 0;
    if (r === 0) return Math.round(p / n);
    return Math.round((p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1));
  };

  const mortgageResult = calcPMT(
    mortgageCalc.principal,
    mortgageCalc.years,
    mortgageCalc.rate
  );
  const creditResult = calcPMT(
    creditCalc.principal,
    creditCalc.years,
    creditCalc.rate
  );

  const applyToExpenses = (id, amount) => {
    setExpenses(
      expenses.map((item) => (item.id === id ? { ...item, amount } : item))
    );
  };

  // --- 衍生計算數據 (現金流) ---
  const totalIncome = incomes.reduce(
    (sum, item) => sum + (Number(item.amount) || 0),
    0
  );
  const totalPassiveIncome = incomes
    .filter((i) => i.isPassive)
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const mainIncome = incomes.find((i) => i.id === 1)?.amount || 0;
  const totalExpense = expenses.reduce(
    (sum, item) => sum + (Number(item.amount) || 0),
    0
  );
  const netFlow = totalIncome - totalExpense;
  const savingsRate =
    totalIncome > 0 ? ((netFlow / totalIncome) * 100).toFixed(1) : 0;

  // 維持力計算 (總現金 ÷ 每月缺口)
  const mainIncomeShortfall = totalExpense - mainIncome;
  const mainIncomeSurvival =
    mainIncomeShortfall > 0
      ? ((assets.cash * 10000) / mainIncomeShortfall).toFixed(1)
      : "∞";

  const unemploymentShortfall = totalExpense - totalPassiveIncome;
  const unemploymentSurvival =
    unemploymentShortfall > 0
      ? ((assets.cash * 10000) / unemploymentShortfall).toFixed(1)
      : "∞";

  // --- 衍生計算數據 (資產負債與大仁哥曝險) ---
  const totalLiabilities = Number(assets.mortgageBalance) * 10000; // 主要負債以填寫的房貸總餘額為準
  const totalAssetsValue =
    (Number(assets.cash) +
      Number(assets.stocksRegular) +
      Number(assets.stocksLeveraged) +
      Number(assets.funds) +
      Number(assets.futures) +
      Number(assets.houseValue)) *
    10000;
  const netWorth = totalAssetsValue - totalLiabilities;
  const houseEquity = Number(assets.houseValue) * 10000 - totalLiabilities;

  // 金融曝險 = 原型股票 + (正二ETF * 2) + 基金 + (期貨保證金 * 5)
  const equityExposure =
    (Number(assets.stocksRegular) +
      Number(assets.stocksLeveraged) * 2 +
      Number(assets.funds) +
      Number(assets.futures) * 5) *
    10000;
  const exposureRatio =
    netWorth > 0 ? ((equityExposure / netWorth) * 100).toFixed(1) : 0;

  // 曝險生命週期建議
  let recExposure = "";
  let phase = "";
  if (age < 35) {
    recExposure = "150% ~ 200%";
    phase = "累積期 (可適度運用槓桿)";
  } else if (age <= 50) {
    recExposure = "100% ~ 150%";
    phase = "成長期 (逐步降低槓桿至100%)";
  } else {
    recExposure = "50% ~ 100%";
    phase = "提領期 (著重穩健保本)";
  }

  // --- 處理函數 ---
  const handleSliderChange = (id, type, amount) => {
    const numAmount = amount === "" ? "" : Number(amount);
    if (type === "income") {
      setIncomes(
        incomes.map((item) =>
          item.id === id ? { ...item, amount: numAmount } : item
        )
      );
    } else {
      setExpenses(
        expenses.map((item) =>
          item.id === id ? { ...item, amount: numAmount } : item
        )
      );
    }
  };

  const handleAssetChange = (field, value) => {
    setAssets({ ...assets, [field]: value === "" ? "" : Number(value) });
  };

  const handleAddItem = (e) => {
    e.preventDefault();
    if (!newItem.name || !newItem.amount || newItem.amount <= 0) return;

    const itemData = {
      id: Date.now(),
      name: newItem.name,
      amount: Number(newItem.amount),
      color: newItem.type === "income" ? "#3b82f6" : "#ef4444",
      isPassive: newItem.type === "income" ? newItem.isPassive : false,
    };

    if (newItem.type === "income") {
      setIncomes([...incomes, itemData]);
    } else {
      setExpenses([...expenses, itemData]);
    }
    setNewItem({ type: "income", name: "", amount: "", isPassive: false });
  };

  const handleDelete = (id, type) => {
    if (type === "income") {
      setIncomes(incomes.filter((i) => i.id !== id));
    } else {
      setExpenses(expenses.filter((e) => e.id !== id));
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("zh-TW", {
      style: "currency",
      currency: "TWD",
      minimumFractionDigits: 0,
    }).format(Number(amount) || 0);
  };

  const defaultIds = [1, 2, 3, 31, 32, 4, 5];
  const getSliderMax = (id, amount) => {
    if (id === 1) return 300000;
    if (id === 2) return 150000;
    if ([3, 31, 32, 4, 5].includes(id)) return 150000;
    return Math.max(150000, (Number(amount) || 0) * 2);
  };

  // 儲存當前狀態快照至雲端
  const handleSaveToCloud = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      const today = new Date();
      const yearMonth = `${today.getFullYear()}-${String(
        today.getMonth() + 1
      ).padStart(2, "0")}`;
      const docRef = doc(
        db,
        "artifacts",
        appId,
        "users",
        user.uid,
        "history",
        yearMonth
      );

      await setDoc(docRef, {
        date: yearMonth,
        netWorth: netWorth,
        totalAssets: totalAssetsValue,
        totalLiabilities: totalLiabilities,
        exposureRatio: Number(exposureRatio),
      });
    } catch (error) {
      console.error("雲端儲存失敗", error);
    }
    setIsSaving(false);
  };

  const handleExport = () => {
    const exportData = {
      exportDate: new Date().toISOString().split("T")[0],
      age,
      assets,
      incomes,
      expenses,
      mortgageCalc,
      creditCalc,
    };
    const dataStr =
      "data:text/json;charset=utf-8," +
      encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchorNode = document.createElement("a");
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute(
      "download",
      `cashflow_record_${exportData.exportDate}.json`
    );
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  // ==========================================
  // 渲染 UI
  // ==========================================
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* 標題區塊 */}
        <header className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
              個人財務與現金流管理系統
            </h1>
            <p className="text-slate-500 mt-1">
              追蹤收支現金流，並整合生命週期投資曝險評估。
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <button
              onClick={handleSaveToCloud}
              disabled={isSaving || !user}
              className="inline-flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-medium py-2 px-4 rounded-lg transition-colors shadow-sm w-full sm:w-auto"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                <polyline points="7 3 7 8 15 8"></polyline>
              </svg>
              <span>{isSaving ? "儲存中..." : "儲存本月紀錄至雲端"}</span>
            </button>
            <button
              onClick={handleExport}
              className="inline-flex items-center justify-center space-x-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium py-2 px-4 rounded-lg transition-colors shadow-sm w-full sm:w-auto"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span>匯出 JSON 紀錄</span>
            </button>
          </div>
        </header>

        {/* 摘要數據卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <SummaryCard
            title="總收入"
            amount={totalIncome}
            color="text-blue-600"
            format={formatCurrency}
          />
          <SummaryCard
            title="總支出"
            amount={totalExpense}
            color="text-red-500"
            format={formatCurrency}
          />
          <SummaryCard
            title="淨現金流 (結餘)"
            amount={netFlow}
            color={netFlow >= 0 ? "text-emerald-500" : "text-rose-600"}
            format={formatCurrency}
            isNet
          />

          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex flex-col justify-center">
            <h3 className="text-sm font-medium text-slate-500 mb-1">儲蓄率</h3>
            <div
              className={`text-3xl font-bold tracking-tight ${
                netFlow >= 0 ? "text-emerald-500" : "text-rose-600"
              }`}
            >
              {netFlow >= 0 ? `${savingsRate}%` : "透支"}
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex flex-col justify-center">
            <h3 className="text-xs font-medium text-slate-500 mb-1">
              僅本業維持 (無被動)
            </h3>
            <div className="text-2xl font-bold tracking-tight text-indigo-500 truncate">
              {mainIncomeSurvival}{" "}
              <span className="text-sm font-normal text-slate-500">個月</span>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex flex-col justify-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-blue-50 rounded-bl-full -z-0"></div>
            <h3 className="text-xs font-medium text-slate-500 mb-1 relative z-10">
              失業可維持 (有被動)
            </h3>
            <div className="text-2xl font-bold tracking-tight text-blue-600 truncate relative z-10">
              {unemploymentSurvival}{" "}
              <span className="text-sm font-normal text-slate-500">個月</span>
            </div>
          </div>
        </div>

        {/* 主視覺區與資料輸入區 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          {/* 左側表單 */}
          <div className="lg:col-span-1 space-y-6">
            {/* 資產與曝險設定 */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border-t-4 border-indigo-500">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-slate-800">
                  資產與曝險試算
                </h2>
                <div className="flex items-center space-x-2">
                  <label className="text-xs text-slate-500">年齡</label>
                  <input
                    type="number"
                    min="18"
                    max="100"
                    value={age}
                    onChange={(e) => setAge(Number(e.target.value))}
                    className="w-16 px-2 py-1 text-sm bg-slate-50 border border-slate-200 rounded"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                <InputGroup
                  label="現金預備金 (萬)"
                  value={assets.cash}
                  onChange={(e) => handleAssetChange("cash", e.target.value)}
                  color="blue"
                />
                <InputGroup
                  label="原型股票 (萬)"
                  value={assets.stocksRegular}
                  onChange={(e) =>
                    handleAssetChange("stocksRegular", e.target.value)
                  }
                  color="indigo"
                />
                <InputGroup
                  label="正二ETF (萬)"
                  value={assets.stocksLeveraged}
                  onChange={(e) =>
                    handleAssetChange("stocksLeveraged", e.target.value)
                  }
                  color="purple"
                />
                <InputGroup
                  label="基金部位 (萬)"
                  value={assets.funds}
                  onChange={(e) => handleAssetChange("funds", e.target.value)}
                  color="indigo"
                />
                <InputGroup
                  label="期貨保證金 (萬)"
                  value={assets.futures}
                  onChange={(e) => handleAssetChange("futures", e.target.value)}
                  color="orange"
                />
                <InputGroup
                  label="房產估值 (萬)"
                  value={assets.houseValue}
                  onChange={(e) =>
                    handleAssetChange("houseValue", e.target.value)
                  }
                  color="emerald"
                />
                <InputGroup
                  label="房貸總餘額 (萬)"
                  value={assets.mortgageBalance}
                  onChange={(e) =>
                    handleAssetChange("mortgageBalance", e.target.value)
                  }
                  color="red"
                />
              </div>

              <div className="p-3 bg-slate-50 rounded-xl space-y-2 text-sm border border-slate-200">
                <div className="flex justify-between">
                  <span className="text-slate-500">總資產：</span>
                  <span className="font-semibold text-slate-700">
                    {formatCurrency(totalAssetsValue)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">總負債 (房貸總額)：</span>
                  <span className="font-semibold text-red-500">
                    {formatCurrency(totalLiabilities)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2">
                  <span className="font-bold text-slate-700">總淨資產：</span>
                  <span className="font-bold text-emerald-600">
                    {formatCurrency(netWorth)}
                  </span>
                </div>
                <div className="text-xs text-slate-400 text-right">
                  (其中房產淨值為 {formatCurrency(houseEquity)})
                </div>
              </div>

              <div className="mt-4 p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                <div className="flex justify-between items-end mb-1">
                  <span className="text-sm font-bold text-indigo-900">
                    目前金融曝險倍率
                  </span>
                  <span className="text-2xl font-black text-indigo-600">
                    {exposureRatio}%
                  </span>
                </div>
                <p className="text-xs text-indigo-700 mb-2">
                  曝險部位 = 原型股票 + (正二ETF × 2) + 基金 + (期貨保證金 × 5)
                </p>
                <div className="bg-white p-2 rounded text-xs text-slate-600 shadow-sm">
                  <span className="font-semibold">建議曝險 ({phase})：</span>{" "}
                  {recExposure}
                </div>
              </div>
            </div>

            {/* 貸款計算機 */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
              <h2 className="text-lg font-semibold mb-4 text-slate-800">
                貸款與每月還款試算
              </h2>

              <div className="mb-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center justify-between">
                  <span>🏠 房貸 (本息均攤)</span>
                  <span className="text-blue-600 font-bold">
                    月繳 {formatCurrency(mortgageResult)}
                  </span>
                </h3>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div>
                    <label className="block text-[10px] font-medium text-slate-500 mb-1">
                      貸款總額 (萬)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={mortgageCalc.principal}
                      onChange={(e) =>
                        setMortgageCalc({
                          ...mortgageCalc,
                          principal: e.target.value,
                        })
                      }
                      className="w-full px-2 py-1.5 text-sm bg-white border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-slate-500 mb-1">
                      年限 (年)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={mortgageCalc.years}
                      onChange={(e) =>
                        setMortgageCalc({
                          ...mortgageCalc,
                          years: e.target.value,
                        })
                      }
                      className="w-full px-2 py-1.5 text-sm bg-white border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-slate-500 mb-1">
                      年利率 (%)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={mortgageCalc.rate}
                      onChange={(e) =>
                        setMortgageCalc({
                          ...mortgageCalc,
                          rate: e.target.value,
                        })
                      }
                      className="w-full px-2 py-1.5 text-sm bg-white border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <button
                  onClick={() => applyToExpenses(3, mortgageResult)}
                  className="w-full text-xs bg-white border border-slate-300 hover:bg-blue-50 text-blue-600 font-medium py-1.5 rounded transition-colors"
                >
                  帶入「房貸」支出項目
                </button>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center justify-between">
                  <span>💳 個人信貸 (本息均攤)</span>
                  <span className="text-red-500 font-bold">
                    月繳 {formatCurrency(creditResult)}
                  </span>
                </h3>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div>
                    <label className="block text-[10px] font-medium text-slate-500 mb-1">
                      貸款總額 (萬)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={creditCalc.principal}
                      onChange={(e) =>
                        setCreditCalc({
                          ...creditCalc,
                          principal: e.target.value,
                        })
                      }
                      className="w-full px-2 py-1.5 text-sm bg-white border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-slate-500 mb-1">
                      年限 (年)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={creditCalc.years}
                      onChange={(e) =>
                        setCreditCalc({ ...creditCalc, years: e.target.value })
                      }
                      className="w-full px-2 py-1.5 text-sm bg-white border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-slate-500 mb-1">
                      年利率 (%)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={creditCalc.rate}
                      onChange={(e) =>
                        setCreditCalc({ ...creditCalc, rate: e.target.value })
                      }
                      className="w-full px-2 py-1.5 text-sm bg-white border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                    />
                  </div>
                </div>
                <button
                  onClick={() => applyToExpenses(31, creditResult)}
                  className="w-full text-xs bg-white border border-slate-300 hover:bg-red-50 text-red-500 font-medium py-1.5 rounded transition-colors"
                >
                  帶入「信貸」支出項目
                </button>
              </div>
            </div>

            {/* 快速調整主要收支 (滑桿) */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
              <h2 className="text-lg font-semibold mb-4 text-slate-800">
                管理每月收支明細
              </h2>
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-500 mb-2 flex items-center justify-between">
                    收入項目
                  </h3>
                  {incomes.map((item) => (
                    <div key={item.id} className="mb-4">
                      <div className="flex justify-between items-center text-sm mb-2">
                        <div className="flex items-center space-x-2">
                          <label className="font-medium text-slate-700">
                            {item.name}
                          </label>
                          {item.isPassive && (
                            <span className="text-[10px] font-semibold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full flex-shrink-0">
                              被動
                            </span>
                          )}
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
                              $
                            </span>
                            <input
                              type="number"
                              min="0"
                              value={item.amount}
                              onChange={(e) =>
                                handleSliderChange(
                                  item.id,
                                  "income",
                                  e.target.value
                                )
                              }
                              className="w-24 pl-5 pr-2 py-1 text-right text-sm font-semibold text-blue-600 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                          {!defaultIds.includes(item.id) && (
                            <button
                              onClick={() => handleDelete(item.id, "income")}
                              className="text-slate-400 hover:text-red-500 transition-colors p-1"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M3 6h18"></path>
                                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max={getSliderMax(item.id, item.amount)}
                        step="1000"
                        value={item.amount || 0}
                        onChange={(e) =>
                          handleSliderChange(item.id, "income", e.target.value)
                        }
                        className="w-full h-2 bg-blue-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                      />
                    </div>
                  ))}
                </div>

                <div className="pt-3 border-t border-slate-100">
                  <h3 className="text-sm font-bold text-slate-500 mb-2">
                    支出項目
                  </h3>
                  {expenses.map((item) => (
                    <div key={item.id} className="mb-4">
                      <div className="flex justify-between items-center text-sm mb-2">
                        <label className="font-medium text-slate-700">
                          {item.name}
                        </label>
                        <div className="flex items-center space-x-2">
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
                              $
                            </span>
                            <input
                              type="number"
                              min="0"
                              value={item.amount}
                              onChange={(e) =>
                                handleSliderChange(
                                  item.id,
                                  "expense",
                                  e.target.value
                                )
                              }
                              className="w-24 pl-5 pr-2 py-1 text-right text-sm font-semibold text-red-500 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                            />
                          </div>
                          {!defaultIds.includes(item.id) && (
                            <button
                              onClick={() => handleDelete(item.id, "expense")}
                              className="text-slate-400 hover:text-red-500 transition-colors p-1"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M3 6h18"></path>
                                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max={getSliderMax(item.id, item.amount)}
                        step="1000"
                        value={item.amount || 0}
                        onChange={(e) =>
                          handleSliderChange(item.id, "expense", e.target.value)
                        }
                        className="w-full h-2 bg-red-100 rounded-lg appearance-none cursor-pointer accent-red-500"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 新增額外項目表單 */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
              <h2 className="text-lg font-semibold mb-4 text-slate-800">
                新增額外自訂項目
              </h2>
              <form onSubmit={handleAddItem} className="space-y-4">
                <div className="flex bg-slate-100 p-1 rounded-lg">
                  <button
                    type="button"
                    className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      newItem.type === "income"
                        ? "bg-white shadow text-blue-600"
                        : "text-slate-500"
                    }`}
                    onClick={() => setNewItem({ ...newItem, type: "income" })}
                  >
                    收入
                  </button>
                  <button
                    type="button"
                    className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      newItem.type === "expense"
                        ? "bg-white shadow text-red-500"
                        : "text-slate-500"
                    }`}
                    onClick={() => setNewItem({ ...newItem, type: "expense" })}
                  >
                    支出
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    項目名稱
                  </label>
                  <input
                    type="text"
                    required
                    value={newItem.name}
                    onChange={(e) =>
                      setNewItem({ ...newItem, name: e.target.value })
                    }
                    placeholder="例如：副業、保姆費..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    金額
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={newItem.amount}
                    onChange={(e) =>
                      setNewItem({ ...newItem, amount: e.target.value })
                    }
                    placeholder="輸入金額"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
                  />
                </div>

                {newItem.type === "income" && (
                  <div className="flex items-center pt-1">
                    <input
                      type="checkbox"
                      id="isPassive"
                      checked={newItem.isPassive}
                      onChange={(e) =>
                        setNewItem({ ...newItem, isPassive: e.target.checked })
                      }
                      className="w-4 h-4 text-blue-600 bg-slate-50 border-slate-300 rounded focus:ring-blue-500"
                    />
                    <label
                      htmlFor="isPassive"
                      className="ml-2 text-sm font-medium text-slate-600 cursor-pointer"
                    >
                      這是一筆「被動收入」
                    </label>
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium py-2 rounded-lg transition-colors"
                >
                  加入至上方收支清單
                </button>
              </form>
            </div>
          </div>

          {/* 右側桑基圖視覺化 */}
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex flex-col">
            <h2 className="text-lg font-semibold mb-6 text-slate-800">
              現金流視覺化圖表
            </h2>
            <div className="flex-1 min-h-[500px] w-full relative">
              <SankeyChart
                incomes={incomes}
                expenses={expenses}
                formatCurrency={formatCurrency}
              />
            </div>
          </div>
        </div>

        {/* 歷史趨勢圖表區塊 */}
        {historyData.length > 0 && (
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 mt-6">
            <h2 className="text-lg font-semibold mb-6 text-slate-800 flex items-center justify-between">
              <span>長期資產成長與曝險趨勢 (雲端紀錄)</span>
              <span className="text-xs font-normal text-slate-500 bg-slate-100 px-2 py-1 rounded">
                資料隨帳號自動同步
              </span>
            </h2>
            <div className="h-[350px] w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={historyData}
                  margin={{ top: 5, right: 20, bottom: 5, left: 20 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#e2e8f0"
                  />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12, fill: "#64748b" }}
                    tickLine={false}
                    axisLine={false}
                  />

                  {/* 左側 Y 軸：資產金額 */}
                  <YAxis
                    yAxisId="left"
                    tickFormatter={(val) => `$${val / 10000}萬`}
                    tick={{ fontSize: 12, fill: "#64748b" }}
                    tickLine={false}
                    axisLine={false}
                    width={80}
                  />

                  {/* 右側 Y 軸：曝險比例 */}
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickFormatter={(val) => `${val}%`}
                    tick={{ fontSize: 12, fill: "#64748b" }}
                    tickLine={false}
                    axisLine={false}
                    width={60}
                  />

                  <Tooltip
                    formatter={(value, name) => {
                      if (name === "exposureRatio")
                        return [`${value}%`, "金融曝險倍率"];
                      return [
                        formatCurrency(value),
                        name === "netWorth" ? "總淨資產" : "總資產",
                      ];
                    }}
                    labelFormatter={(label) => `紀錄月份: ${label}`}
                    contentStyle={{
                      borderRadius: "8px",
                      border: "none",
                      boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                    }}
                  />
                  <Legend wrapperStyle={{ paddingTop: "20px" }} />

                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="netWorth"
                    name="總淨資產"
                    stroke="#10b981"
                    strokeWidth={3}
                    dot={{ r: 4, strokeWidth: 2, fill: "#fff" }}
                    activeDot={{ r: 6 }}
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="totalAssets"
                    name="總資產"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="exposureRatio"
                    name="金融曝險倍率"
                    stroke="#f59e0b"
                    strokeWidth={3}
                    dot={{ r: 4, strokeWidth: 2, fill: "#fff" }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// 輔助 UI 組件
// ==========================================
function SummaryCard({ title, amount, color, format, isNet }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex flex-col justify-center">
      <h3 className="text-sm font-medium text-slate-500 mb-1">{title}</h3>
      <div className={`text-3xl font-bold tracking-tight truncate ${color}`}>
        {isNet && amount > 0 ? "+" : ""}
        {format(amount)}
      </div>
    </div>
  );
}

function InputGroup({ label, value, onChange, color }) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-slate-500 mb-1">
        {label}
      </label>
      <input
        type="number"
        min="0"
        value={value}
        onChange={onChange}
        className={`w-full px-2 py-1.5 text-sm bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-${color}-500`}
      />
    </div>
  );
}

// ==========================================
// 核心視覺化：動態桑基圖 (Sankey Diagram)
// ==========================================
function SankeyChart({ incomes, expenses, formatCurrency }) {
  const { nodes, flows, maxTotal } = useMemo(() => {
    const totalIn = incomes.reduce(
      (sum, item) => sum + (Number(item.amount) || 0),
      0
    );
    const totalEx = expenses.reduce(
      (sum, item) => sum + (Number(item.amount) || 0),
      0
    );

    const balanceNodes = [];
    if (totalIn > totalEx) {
      balanceNodes.push({
        id: "savings",
        name: "儲蓄與結餘",
        amount: totalIn - totalEx,
        type: "savings",
        color: "#10b981",
      });
    } else if (totalEx > totalIn) {
      balanceNodes.push({
        id: "deficit",
        name: "透支 (需舉債/吃老本)",
        amount: totalEx - totalIn,
        type: "deficit",
        color: "#64748b",
      });
    }

    const leftItems = [
      ...incomes,
      ...balanceNodes.filter((n) => n.type === "deficit"),
    ];
    const rightItems = [
      ...expenses,
      ...balanceNodes.filter((n) => n.type === "savings"),
    ];

    const maxTotalAmount = Math.max(totalIn, totalEx) || 1;

    const width = 800;
    const height = 500;
    const paddingX = 120;
    const paddingY = 20;
    const nodeWidth = 24;
    const gap = 12;

    const availableHeightLeft =
      height - paddingY * 2 - Math.max(0, leftItems.length - 1) * gap;
    const availableHeightRight =
      height - paddingY * 2 - Math.max(0, rightItems.length - 1) * gap;
    const scale =
      Math.min(availableHeightLeft, availableHeightRight) / maxTotalAmount;

    let generatedNodes = [];
    let generatedFlows = [];

    let currentYLeft =
      paddingY +
      (height -
        paddingY * 2 -
        (leftItems.reduce((s, i) => s + (Number(i.amount) || 0) * scale, 0) +
          (leftItems.length - 1) * gap)) /
        2;
    const leftNodesList = leftItems.map((item) => {
      const h = (Number(item.amount) || 0) * scale;
      const node = {
        ...item,
        x: paddingX,
        y: currentYLeft,
        w: nodeWidth,
        h,
        align: "left",
      };
      currentYLeft += h + gap;
      return node;
    });

    const poolHeight = maxTotalAmount * scale;
    const poolNode = {
      id: "pool",
      name: "總資金",
      amount: maxTotalAmount,
      x: width / 2 - nodeWidth / 2,
      y: height / 2 - poolHeight / 2,
      w: nodeWidth,
      h: poolHeight,
      color: "#94a3b8",
      align: "center",
    };

    let currentYRight =
      paddingY +
      (height -
        paddingY * 2 -
        (rightItems.reduce((s, i) => s + (Number(i.amount) || 0) * scale, 0) +
          (rightItems.length - 1) * gap)) /
        2;
    const rightNodesList = rightItems.map((item) => {
      const h = (Number(item.amount) || 0) * scale;
      const node = {
        ...item,
        x: width - paddingX - nodeWidth,
        y: currentYRight,
        w: nodeWidth,
        h,
        align: "right",
      };
      currentYRight += h + gap;
      return node;
    });

    generatedNodes = [...leftNodesList, poolNode, ...rightNodesList];

    let poolLeftYOffset = 0;
    leftNodesList.forEach((leftNode) => {
      const flowHeight = leftNode.h;
      generatedFlows.push({
        source: leftNode,
        target: poolNode,
        sy: leftNode.y,
        ty: poolNode.y + poolLeftYOffset,
        h: flowHeight,
        color: leftNode.color,
      });
      poolLeftYOffset += flowHeight;
    });

    let poolRightYOffset = 0;
    rightNodesList.forEach((rightNode) => {
      const flowHeight = rightNode.h;
      generatedFlows.push({
        source: poolNode,
        target: rightNode,
        sy: poolNode.y + poolRightYOffset,
        ty: rightNode.y,
        h: flowHeight,
        color: rightNode.color,
      });
      poolRightYOffset += flowHeight;
    });

    return {
      nodes: generatedNodes,
      flows: generatedFlows,
      maxTotal: maxTotalAmount,
    };
  }, [incomes, expenses]);

  const drawPath = (sx, sy, tx, ty, h) => {
    const midX = (sx + tx) / 2;
    return `M ${sx} ${sy} C ${midX} ${sy}, ${midX} ${ty}, ${tx} ${ty} L ${tx} ${
      ty + h
    } C ${midX} ${ty + h}, ${midX} ${sy + h}, ${sx} ${sy + h} Z`;
  };

  if (maxTotal === 0 || maxTotal === 1) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-slate-400">
        請新增收支項目以產生圖表
      </div>
    );
  }

  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 800 500"
      preserveAspectRatio="xMidYMid meet"
      className="overflow-visible"
    >
      {flows.map((flow, i) => (
        <path
          key={`flow-${i}`}
          d={drawPath(
            flow.source.x + flow.source.w,
            flow.sy,
            flow.target.x,
            flow.ty,
            flow.h
          )}
          fill={flow.color}
          opacity="0.25"
          className="transition-opacity duration-300 hover:opacity-50 cursor-pointer"
        >
          <title>{`${flow.source.name} → ${flow.target.name}: ${formatCurrency(
            (flow.h / (flow.source.h || 1)) * flow.source.amount
          )}`}</title>
        </path>
      ))}
      {nodes.map((node) => (
        <g key={`node-${node.id}`}>
          <rect
            x={node.x}
            y={node.y}
            width={node.w}
            height={Math.max(2, node.h)}
            fill={node.color || "#333"}
            rx="4"
            className="transition-all duration-300"
          >
            <title>{`${node.name}: ${formatCurrency(node.amount)}`}</title>
          </rect>
          <text
            x={
              node.align === "left"
                ? node.x - 12
                : node.align === "right"
                ? node.x + node.w + 12
                : node.x + node.w / 2
            }
            y={node.align === "center" ? node.y - 12 : node.y + node.h / 2 + 5}
            textAnchor={
              node.align === "left"
                ? "end"
                : node.align === "right"
                ? "start"
                : "middle"
            }
            className="text-sm fill-slate-700 font-medium"
            fontSize="14"
          >
            {node.name}
          </text>
          {node.align !== "center" && (
            <text
              x={node.align === "left" ? node.x - 12 : node.x + node.w + 12}
              y={node.y + node.h / 2 + 22}
              textAnchor={node.align === "left" ? "end" : "start"}
              className="text-xs fill-slate-500"
              fontSize="12"
            >
              {formatCurrency(node.amount)}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
