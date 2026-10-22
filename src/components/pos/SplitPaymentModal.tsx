import React, { useEffect, useMemo, useState } from 'react';
import { PaymentMethod, PaymentMethodConfig, SplitPaymentDetail } from '../../types/restaurant';
import { useAppTheme } from '../../context/ThemeContext';
import { X, Check, AlertCircle, Plus, Trash2 } from 'lucide-react';

interface SplitPaymentModalProps {
  grandTotal: number;
  currencySymbol: string;
  paymentMethods: PaymentMethodConfig[];
  isOpen: boolean;
  onClose: () => void;
  onConfirmPayment: (method: PaymentMethod, amountPaid: number, changeGiven: number, splits?: SplitPaymentDetail[], paymentReference?: string) => Promise<void> | void;
}

interface SplitLine {
  id: string;
  method: PaymentMethod;
  amount: string;
  reference: string;
}

export const SplitPaymentModal: React.FC<SplitPaymentModalProps> = ({
  grandTotal, currencySymbol, paymentMethods, isOpen, onClose, onConfirmPayment,
}) => {
  const { styles } = useAppTheme();
  const enabledMethods = useMemo(() => paymentMethods.filter((method) => method.enabled), [paymentMethods]);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('cash');
  const [cashTendered, setCashTendered] = useState(grandTotal.toFixed(2));
  const [reference, setReference] = useState('');
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [splitLines, setSplitLines] = useState<SplitLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const money = (amount: number) => `${currencySymbol || 'PKR'} ${amount.toFixed(2)}`;

  useEffect(() => {
    if (!isOpen) return;
    const defaultMethod = enabledMethods[0]?.id || 'cash';
    setSelectedMethod(defaultMethod);
    setCashTendered(grandTotal.toFixed(2));
    setReference('');
    setSplitLines([{ id: 'split-1', method: defaultMethod, amount: grandTotal.toFixed(2), reference: '' }]);
    setError(null);
    setIsSubmitting(false);
  }, [isOpen, grandTotal, enabledMethods]);

  if (!isOpen) return null;

  const selectedConfig = enabledMethods.find((method) => method.id === selectedMethod);
  const tendered = Number(cashTendered) || 0;
  const changeDue = selectedMethod === 'cash' ? Math.max(0, +(tendered - grandTotal).toFixed(2)) : 0;
  const splitTotal = splitLines.reduce((total, line) => total + (Number(line.amount) || 0), 0);

  const updateSplit = (id: string, updates: Partial<SplitLine>) => {
    setSplitLines((current) => current.map((line) => line.id === id ? { ...line, ...updates } : line));
    setError(null);
  };

  const addSplitLine = () => {
    const method = enabledMethods[0]?.id || 'cash';
    setSplitLines((current) => [...current, { id: `split-${Date.now()}`, method, amount: '0.00', reference: '' }]);
  };

  const completeStandard = async () => {
    if (!selectedConfig) return setError('Select an enabled payment method.');
    if (selectedConfig.requiresReference && !reference.trim()) return setError(`${selectedConfig.name} reference is required.`);
    if (selectedMethod === 'cash' && tendered < grandTotal) return setError('Cash received cannot be less than the payable amount.');
    setIsSubmitting(true);
    try {
      await onConfirmPayment(selectedMethod, selectedMethod === 'cash' ? tendered : grandTotal, changeDue, undefined, reference.trim() || undefined);
      onClose();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'The sale could not be saved.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const completeSplit = async () => {
    if (splitLines.length < 2) return setError('Add at least two payment lines for a split payment.');
    if (Math.abs(splitTotal - grandTotal) > 0.01) return setError(`Split total must equal ${money(grandTotal)}. Current: ${money(splitTotal)}.`);
    for (const line of splitLines) {
      const config = enabledMethods.find((method) => method.id === line.method);
      if (!config) return setError('A split line uses a disabled payment method.');
      if (config.requiresReference && !line.reference.trim()) return setError(`${config.name} reference is required.`);
    }
    setIsSubmitting(true);
    try {
      await onConfirmPayment('split', grandTotal, 0, splitLines.map((line) => ({ method: line.method, amount: Number(line.amount), reference: line.reference.trim() || undefined })));
      onClose();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'The sale could not be saved.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#18302D]/45 backdrop-blur-sm p-4">
      <div className="bg-[#FFFDFC] border border-[#E8E3DA] rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden text-[#18302D]">
        <div className="px-6 py-4 bg-[#F4F8F5] border-b border-[#E8E3DA] flex items-center justify-between">
          <div><h3 className="font-bold text-base">Payment Checkout & Settlement</h3><p className="text-xs text-slate-400">Record offline payment tender and reference.</p></div>
          <button type="button" onClick={onClose} className="text-[#516863] hover:bg-white hover:text-[#16665A] p-1 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 bg-[#E9F4EE] border-b border-[#CFE3DC] flex items-center justify-between">
          <div><span className="text-xs font-bold uppercase tracking-wider">Payable Total</span><div className="text-2xl font-black font-mono mt-1">{money(grandTotal)}</div></div>
          <button type="button" onClick={() => { setIsSplitMode((value) => !value); setError(null); }} className="px-3 py-1.5 rounded-xl text-xs font-bold border border-[#A7D6CC] bg-white text-[#16665A] hover:bg-[#F4F8F5]">{isSplitMode ? 'Standard Mode' : 'Split Payment'}</button>
        </div>
        <div className="p-6 space-y-4">
          {!isSplitMode ? <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {enabledMethods.map((method) => <button key={method.id} type="button" onClick={() => { setSelectedMethod(method.id); setReference(''); setError(null); }} className={`p-3 rounded-2xl border text-xs font-bold ${selectedMethod === method.id ? 'bg-[#E9F4EE] border-[#16665A] text-[#16665A] shadow-sm' : 'bg-white border-[#E8E3DA] text-[#35514C] hover:bg-[#F4F8F5] hover:border-[#A7D6CC]'}`}>{method.name}</button>)}
            </div>
            {selectedMethod === 'cash' && <div className="space-y-2"><label className="block text-xs font-bold">Cash received</label><input type="number" min="0" step="0.01" value={cashTendered} onChange={(event) => { setCashTendered(event.target.value); setError(null); }} className="w-full px-3 py-2 border rounded-xl text-right font-mono" /><p className="text-xs text-slate-500">Change due: <strong>{money(changeDue)}</strong></p></div>}
            {selectedConfig?.requiresReference && <div><label className="block text-xs font-bold mb-1">{selectedConfig.name} reference *</label><input type="text" value={reference} onChange={(event) => { setReference(event.target.value); setError(null); }} placeholder="Transaction / receipt reference" className="w-full px-3 py-2 border rounded-xl" /></div>}
          </> : <>
            <div className="space-y-3">
              {splitLines.map((line) => {
                const config = enabledMethods.find((method) => method.id === line.method);
                return <div key={line.id} className="p-3 bg-[#FCFBF8] border border-[#E8E3DA] rounded-xl space-y-2">
                  <div className="flex gap-2"><select value={line.method} onChange={(event) => updateSplit(line.id, { method: event.target.value as PaymentMethod, reference: '' })} className="flex-1 px-2 py-2 border rounded-lg">{enabledMethods.map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}</select><input type="number" min="0" step="0.01" value={line.amount} onChange={(event) => updateSplit(line.id, { amount: event.target.value })} className="w-28 px-2 py-2 border rounded-lg text-right font-mono" />{splitLines.length > 2 && <button type="button" onClick={() => setSplitLines((lines) => lines.filter((item) => item.id !== line.id))} className="text-rose-600"><Trash2 className="w-4 h-4" /></button>}</div>
                  {config?.requiresReference && <input type="text" value={line.reference} onChange={(event) => updateSplit(line.id, { reference: event.target.value })} placeholder={`${config.name} reference *`} className="w-full px-2 py-2 border rounded-lg" />}
                </div>;
              })}
            </div>
            <div className="flex justify-between items-center"><span className="text-xs font-bold">Split total: {money(splitTotal)}</span><button type="button" onClick={addSplitLine} className="text-xs font-bold text-[#16665A] hover:text-[#115448] flex items-center gap-1"><Plus className="w-4 h-4" /> Add method</button></div>
          </>}
          {error && <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold flex gap-2"><AlertCircle className="w-4 h-4" />{error}</div>}
        </div>
        <div className="p-4 bg-[#F4F8F5] border-t border-[#E8E3DA] flex justify-end gap-2"><button type="button" disabled={isSubmitting} onClick={onClose} className="px-4 py-2 text-xs border border-[#A7D6CC] bg-white text-[#16665A] font-semibold rounded-xl hover:bg-[#E9F4EE]">Cancel</button><button type="button" disabled={isSubmitting} onClick={isSplitMode ? completeSplit : completeStandard} className="px-5 py-2.5 bg-[#16665A] hover:bg-[#115448] text-white font-bold text-xs rounded-xl shadow-sm flex gap-2 items-center"><Check className="w-4 h-4" />{isSubmitting ? 'Saving…' : isSplitMode ? 'Finalize Split' : `Complete Sale (${money(grandTotal)})`}</button></div>
      </div>
    </div>
  );
};
