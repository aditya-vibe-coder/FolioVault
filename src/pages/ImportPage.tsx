import React, { useState } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { useLicense } from '../hooks/useLicense';
import { useProFetch } from '../hooks/useProFetch';
import { useAppStore } from '../store/appStore';
import { db } from '../lib/db';
import {
  parseZerodhaCSV,
  parseTemplateCSV,
  generateTemplateCSV,
  ParsedRow,
  TemplateRow
} from '../lib/csvParsers';
import {
  UploadCloud,
  Download,
  FileCheck,
  CheckCircle,
  Sparkles,
  Crown,
} from 'lucide-react';
import { ProBadge } from '../components/ui/ProBadge';
import { cn } from '../lib/formatters';
import { Helmet } from 'react-helmet-async';

export default function ImportPage() {
  const { onUpgrade } = useOutletContext<{ onUpgrade: () => void }>();
  const navigate = useNavigate();
  const { isPro } = useLicense();
  const proFetch = useProFetch();
  const { settings } = useAppStore();

  const [activeImportType, setActiveImportType] = useState<'none' | 'zerodha' | 'template' | 'cas_pdf'>('none');
  const [dragActive, setDragActive] = useState(false);
  const [parseSummary, setParseSummary] = useState<string | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [isSuccess, setIsSuccess] = useState(false);

  // Parsed intermediate states before writing to database
  const [zerodhaRows, setZerodhaRows] = useState<ParsedRow[]>([]);
  const [templateRows, setTemplateRows] = useState<TemplateRow[]>([]);
  const [parsedCasTransactions, setParsedCasTransactions] = useState<any[]>([]);
  const [parsingPdf, setParsingPdf] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  // CSV drag options
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileProcess(file);
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileProcess(file);
  };

  // Setup PDF payload
  const handlePdfProcess = async (file: File) => {
    setParseErrors([]);
    setParseSummary(null);
    setIsSuccess(false);
    setPdfFile(file);
    setParsedCasTransactions([]);
    setParseSummary(`Selected Mutual Fund Statement "${file.name}". Click the button below to initiate full server-side AI parsing.`);
  };

  const executeCasPdfParsing = async () => {
    if (!pdfFile) return;
    setParsingPdf(true);
    setParseErrors([]);
    setParseSummary(null);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = (reader.result as string).split(',')[1];
        const res = await proFetch('/api/parser/pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pdfBase64: base64 })
        });
        if (res.status === 402) {
          setParseErrors([
            'AI CAS PDF parser is a FolioVault Pro feature. Your Pro license could not be verified. Please re-activate it in Settings or upgrade to Pro.',
          ]);
          return;
        }
        const data = await res.json();
        if (data.success) {
          setParsedCasTransactions(data.transactions);
          setParseSummary(`AI Statement Parser Successful! Found ${data.transactions.length} CAS mutual fund transactions. Look at the data review below.`);
        } else {
          setParseErrors([data.error || data.message || 'Gemini could not structure this mutual fund statement. Please make sure the PDF has readable text.']);
        }
      } catch (err: any) {
        setParseErrors([err.message || 'Error occurred calling server side PDF parser.']);
      } finally {
        setParsingPdf(false);
      }
    };
    reader.readAsDataURL(pdfFile);
  };

  // Main file processing logic
  const handleFileProcess = async (file: File) => {
    setParseErrors([]);
    setParseSummary(null);
    setIsSuccess(false);

    if (activeImportType === 'cas_pdf') {
      handlePdfProcess(file);
      return;
    }

    try {
      const content = await file.text();
      const portfolioId = settings.defaultPortfolioId || '';

      if (activeImportType === 'zerodha') {
        const result = parseZerodhaCSV(content);
        setParseErrors(result.errors);
        
        if (result.rows.length > 0) {
          setZerodhaRows(result.rows);
          setParseSummary(`Tradebook parsed successfully: Found ${result.rows.length} valid transactions. (${result.totalSkipped} skipped rows).`);
        } else {
          setParseSummary('Error: Could not parse any valid transaction rows. Verify columns.');
        }
      } else {
        // Custom template
        const result = parseTemplateCSV(content);
        setParseErrors(result.errors);

        if (result.templateRows.length > 0) {
          setTemplateRows(result.templateRows);
          setParseSummary(`Template parsed: Loaded ${result.templateRows.length} valid entries. Verify list items below.`);
        } else {
          setParseSummary('Error: No valid transaction rows extracted from the CSV file.');
        }
      }
    } catch (e: any) {
      setParseErrors([e?.message || 'File stream compression error.']);
    }
  };

  // Write Zerodha trade rows to IndexedDB
  const executeZerodhaImport = async () => {
    if (zerodhaRows.length === 0) return;
    try {
      const portfolioId = settings.defaultPortfolioId || '';

      await db.transaction('rw', db.holdings, db.transactions, async () => {
        // Collect existing holdings to avoid duplicate index creation
        const existingHoldings = await db.holdings.where({ portfolioId }).toArray();
        const holdingMap = new Map(existingHoldings.map(h => [h.symbol?.toUpperCase(), h.id]));

        for (const r of zerodhaRows) {
          let hId = holdingMap.get(r.symbol);

          // If holding does not exist, create it on-the-fly dynamically
          if (!hId) {
            hId = crypto.randomUUID();
            await db.holdings.add({
              id: hId,
              portfolioId,
              name: `${r.symbol} Corporation Shares`,
              type: 'stock',
              assetClass: 'equity',
              symbol: r.symbol,
              isin: r.isin,
              exchange: r.exchange as any,
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
            holdingMap.set(r.symbol, hId);
          }

          // Ingest transaction
          await db.transactions.add({
            id: crypto.randomUUID(),
            holdingId: hId,
            portfolioId,
            date: r.date,
            type: r.type,
            units: r.units,
            price: r.price,
            amount: r.amount,
            createdAt: new Date(),
            importSource: 'zerodha_csv',
          });
        }
      });

      setIsSuccess(true);
      setZerodhaRows([]);
      setParseSummary('Zerodha tradebook successfully imported to your portfolio!');
    } catch (e: any) {
      alert("Error committing transactions to DB: " + e?.message);
    }
  };

  // Write template rows to IndexedDB
  const executeTemplateImport = async () => {
    if (templateRows.length === 0) return;
    try {
      const portfolioId = settings.defaultPortfolioId || '';

      await db.transaction('rw', db.holdings, db.transactions, async () => {
        const existingHoldings = await db.holdings.where({ portfolioId }).toArray();
        // Since template uses Name, map by lowercase Name
        const holdingMap = new Map(existingHoldings.map(h => [h.name.toLowerCase().trim(), h.id]));

        for (const r of templateRows) {
          const normName = r.holdingName.toLowerCase().trim();
          let hId = holdingMap.get(normName);

          if (!hId) {
            hId = crypto.randomUUID();
            await db.holdings.add({
              id: hId,
              portfolioId,
              name: r.holdingName.trim(),
              type: r.holdingType,
              assetClass: r.assetClass as any,
              symbol: r.symbol ? r.symbol : undefined,
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
            holdingMap.set(normName, hId);
          }

          await db.transactions.add({
            id: crypto.randomUUID(),
            holdingId: hId,
            portfolioId,
            date: r.date,
            type: r.transactionType as any,
            units: r.units,
            price: r.pricePerUnit,
            amount: r.amount,
            createdAt: new Date(),
            notes: r.notes,
            importSource: 'template_csv',
          });
        }
      });

      setIsSuccess(true);
      setTemplateRows([]);
      setParseSummary('FolioVault template transactions successfully imported!');
    } catch (e: any) {
      alert("IndexedDB transaction rejected: " + e?.message);
    }
  };

  // Commit CAS MF transactions to DB
  const executeCasPdfImport = async () => {
    if (parsedCasTransactions.length === 0) return;
    try {
      const portfolioId = settings.defaultPortfolioId || '';

      await db.transaction('rw', db.holdings, db.transactions, async () => {
        const existingHoldings = await db.holdings.where({ portfolioId }).toArray();
        const holdingMap = new Map(existingHoldings.map(h => [h.name.toLowerCase().trim(), h.id]));

        for (const tx of parsedCasTransactions) {
          const normName = tx.schemeName.toLowerCase().trim();
          let hId = holdingMap.get(normName);

          if (!hId) {
            hId = crypto.randomUUID();
            const lowerName = normName;
            const isDebt = lowerName.includes('debt') || lowerName.includes('liquid') || lowerName.includes('bond') || lowerName.includes('gilt') || lowerName.includes('money market') || lowerName.includes('treasury');
            
            await db.holdings.add({
              id: hId,
              portfolioId,
              name: tx.schemeName.trim(),
              type: 'mf',
              assetClass: isDebt ? 'debt' : 'equity',
              symbol: tx.isin || undefined,
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
            holdingMap.set(normName, hId);
          }

          await db.transactions.add({
            id: crypto.randomUUID(),
            holdingId: hId,
            portfolioId,
            date: new Date(tx.date),
            type: tx.type as any, // 'buy' / 'sell', etc.
            units: Number(tx.units || 0),
            price: Number(tx.price || 0),
            amount: Number(tx.amount || 0),
            createdAt: new Date(),
            importSource: 'cas_pdf',
          });
        }
      });

      setIsSuccess(true);
      setParsedCasTransactions([]);
      setParseSummary('AI PDF Statement successfully parsed and active mutual funds holdings imported!');
    } catch (e: any) {
      alert("Error committing CAS Mutual Funds to DB: " + e?.message);
    }
  };

  // Custom template download trigger
  const handleDownloadTemplate = () => {
    const csvContent = generateTemplateCSV();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'FolioVault-Import-Template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 font-sans">
      <Helmet>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
          
      {/* ─── Header ─── */}
      <div>
        <h1 className="text-2xl font-black text-slate-800 dark:text-slate-101 uppercase tracking-tight">
          Data Import Center
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Bulk-load transaction history journals without transmitting spreadsheets over the web. Secure and private.
        </p>
      </div>

      {activeImportType === 'none' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
          
          {/* Card 1: Manual entry */}
          <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-blue-105 border flex items-center justify-center text-blue-600 block mb-4">
                ✏️
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-101">Manual asset logger</h3>
              <p className="text-xs text-slate-450 dark:text-slate-400 leading-relaxed font-semibold mt-1.5">
                Ideal to track single accounts, provident cash funds (PPF, EPF), bank fixed deposits (FD), NPS splits, and custom assets.
              </p>
            </div>
            <button
              onClick={() => navigate('/app/holdings')}
              className="w-full mt-6 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200 text-xs font-bold rounded-lg cursor-pointer animate-fade-in"
            >
              Construct Assets Ledger →
            </button>
          </div>

          {/* Card 2: ZerodhaTradebook */}
          <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col justify-between relative">
            <div className="absolute top-0 right-0 transform translate-x-0 -translate-y-1/2">
              <ProBadge variant="pro" size="sm" />
            </div>
            <div>
              <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-600 mb-4">
                📈
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Zerodha tradebooks</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-semibold mt-1.5">
                Drag in Console trade history sheet exports. Matches exchange tickers and imports transaction timelines in seconds.
              </p>
            </div>
            <button
              onClick={() => {
                if (!isPro) onUpgrade();
                else setActiveImportType('zerodha');
              }}
              className="w-full mt-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg cursor-pointer shadow-md shadow-blue-500/10"
            >
              {isPro ? 'Parse Zerodha CSV →' : '🔒 Unlock with Pro →'}
            </button>
          </div>

          {/* Card 3: Custom templates */}
          <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-805 rounded-2xl flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-emerald-105 border flex items-center justify-center text-emerald-600 block mb-4">
                📝
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-101">Template CSV import</h3>
              <p className="text-xs text-slate-450 dark:text-slate-450 leading-relaxed font-semibold mt-1.5">
                Consolidate erratic funds by filling out our clean spreadsheet template. Auto-indexes buy dates, quantities, and assets class weightings.
              </p>
            </div>
            <button
              onClick={() => setActiveImportType('template')}
              className="w-full mt-6 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200 text-xs font-bold rounded-lg cursor-pointer"
            >
              Parse Custom Template →
            </button>
          </div>

          {/* Card 4: AI CAS PDF Statement Parser */}
          <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col justify-between relative overflow-hidden">
            <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/10 blur-2xl pointer-events-none" />
            <div className="absolute top-0 right-0 transform translate-x-0 -translate-y-1/2">
              <ProBadge variant="ai" size="sm" label="AI · PRO" />
            </div>
            <div>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/15 to-pink-500/15 border border-purple-500/20 flex items-center justify-center text-purple-600 mb-4">
                <Sparkles className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                AI CAS PDF Parser
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-semibold mt-1.5">
                Drop in your CAMS or KFintech Consolidated Account Statement. Our Gemini-powered AI extracts all MF transactions in one click — even password-protected PDFs.
              </p>
              {!isPro && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold mt-2 flex items-center gap-1">
                  <Crown className="w-3 h-3" /> Unlock with Pro — ₹99/mo
                </p>
              )}
            </div>
            <button
              onClick={() => {
                if (!isPro) { onUpgrade(); return; }
                setActiveImportType('cas_pdf');
              }}
              className={cn(
                'w-full mt-6 py-2.5 text-xs font-bold rounded-lg cursor-pointer shadow-md transition-colors',
                isPro
                  ? 'bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 text-white shadow-purple-500/20'
                  : 'bg-slate-900 hover:bg-slate-800 text-white',
              )}
            >
              {isPro ? '✨ Parse CAS PDF Statement →' : '🔒 Unlock AI Parser with Pro →'}
            </button>
          </div>

        </div>
      ) : (
        // File Uploader and preview console section
        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-6">
          
          {/* Header Row of sub-import */}
          <div className="flex items-center justify-between border-b pb-4 border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-tight">
                {activeImportType === 'zerodha' ? 'Zerodha Tradebook parser' : activeImportType === 'cas_pdf' ? 'CAMS / KFintech Statement AI Parser' : 'FolioVault Custom Sheet Parser'}
              </h3>
              <p className="text-xs text-slate-450">
                {activeImportType === 'zerodha' 
                  ? 'Ingests standard .csv trade files extracted from Console reports.' 
                  : activeImportType === 'cas_pdf'
                  ? 'Upload your Consolidated Account Statement PDF. Powered server-side by Gemini 3.5.'
                  : 'Requires our spreadsheet columns matrix format to align indices correctly.'}
              </p>
            </div>
            
            <button 
              onClick={() => {
                setActiveImportType('none');
                setParseSummary(null);
                setParseErrors([]);
                setZerodhaRows([]);
                setTemplateRows([]);
                setParsedCasTransactions([]);
                setPdfFile(null);
              }}
              className="px-2.5 py-1.5 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-850 hover:bg-slate-100 text-[10px] font-sans font-bold uppercase rounded-lg text-slate-500 cursor-pointer"
            >
              Discard / Back
            </button>
          </div>

          {/* Download Template block (for template only) */}
          {activeImportType === 'template' && (
            <div className="p-4 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/50 rounded-xl flex items-center justify-between flex-wrap gap-4 text-xs font-semibold">
              <div className="space-y-0.5">
                <span className="font-bold text-blue-800 dark:text-blue-400 block">Download Excel CSV Template</span>
                <span className="text-slate-450">Download, add buy dates, holding labels, class, units, prices and import.</span>
              </div>
              <button
                onClick={handleDownloadTemplate}
                className="py-1.5 px-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold flex items-center gap-1.5 cursor-pointer shadow-sm text-xs"
              >
                <Download className="w-4 h-4" /> Download Template
              </button>
            </div>
          )}

          {/* Drag Uploader Zone */}
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-8 text-center flex flex-col justify-center items-center gap-2 transition-colors ${dragActive ? 'border-blue-500 bg-blue-500/5' : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/20'}`}
          >
            <UploadCloud className="w-10 h-10 text-slate-400 animate-pulse" />
            <span className="font-bold text-slate-805 dark:text-slate-105 text-xs sm:text-sm">
              {activeImportType === 'cas_pdf' ? 'Drag and drop your Mutual Fund CAS PDF here' : 'Drag and drop your spreadsheet file here'}
            </span>
            <span className="text-[11px] text-slate-400">
              {activeImportType === 'cas_pdf' ? 'Only PDF statements are supported (Max 15MB limit)' : 'Only files ending with .csv format are compatible (Max 10MB limit)'}
            </span>

            <label className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-sm">
              Browse Files From Device
              <input
                type="file"
                accept={activeImportType === 'cas_pdf' ? ".pdf" : ".csv"}
                className="hidden"
                onChange={handleFileInput}
              />
            </label>
          </div>

          {/* Parsing Results console metrics */}
          {parseSummary && (
            <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-820 rounded-xl space-y-3 font-sans">
              
              <div className="flex items-start gap-2.5 text-xs font-semibold leading-normal">
                {isSuccess ? (
                  <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                ) : (
                  <FileCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <span className="font-bold block text-slate-900 dark:text-slate-50">{parseSummary}</span>
                </div>
              </div>

              {parseErrors.length > 0 && (
                <details className="text-[10px] sm:text-xs">
                  <summary className="text-red-650 dark:text-red-400 font-bold hover:underline cursor-pointer">
                    ⚠️ View skipped errors or parsing failure logs ({parseErrors.length})
                  </summary>
                  <ul className="list-disc pl-5 mt-2 text-slate-500 space-y-1 overflow-y-auto max-h-[120px] font-mono leading-tight">
                    {parseErrors.map((err, id) => (
                      <li key={id}>{err}</li>
                    ))}
                  </ul>
                </details>
              )}

              {/* PDF parsing execution action block */}
              {activeImportType === 'cas_pdf' && pdfFile && parsedCasTransactions.length === 0 && (
                <button
                  onClick={executeCasPdfParsing}
                  disabled={parsingPdf}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold rounded-lg text-xs transition-colors shadow-md flex items-center gap-2 cursor-pointer"
                >
                  {parsingPdf ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Structuring CAMS/KFintech Statement via Gemini...
                    </>
                  ) : '🚀 Run Secure Gemini Statement Parser'}
                </button>
              )}

              {/* Execution Actions button switches */}
              {zerodhaRows.length > 0 && !isSuccess && (
                <button
                  onClick={executeZerodhaImport}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs transition-colors shadow-md cursor-pointer"
                >
                  Write Zerodha Trade entries to DB
                </button>
              )}

              {templateRows.length > 0 && !isSuccess && (
                <button
                  onClick={executeTemplateImport}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs transition-colors shadow-md cursor-pointer"
                >
                  Write parsed custom entries to DB
                </button>
              )}

              {parsedCasTransactions.length > 0 && !isSuccess && (
                <button
                  onClick={executeCasPdfImport}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs transition-colors shadow-md cursor-pointer"
                >
                  Commit AI Parsed Mutual Fund Positions to DB
                </button>
              )}

            </div>
          )}

        </div>
      )}

    </div>
  );
}
