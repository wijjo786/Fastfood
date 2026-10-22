import React, { useState } from 'react';
import { Ingredient, Recipe, Branch, User, RecipeItem, InventoryVarianceRecord, QuickStockPurchase } from '../../types/restaurant';
import { sqliteService } from '../../services/sqliteStorage';
import { useAppTheme } from '../../context/ThemeContext';
import { formatCurrency } from '../../utils/currency';
import {
  Boxes,
  Scroll,
  AlertTriangle,
  RefreshCw,
  Plus,
  DollarSign,
  CheckCircle,
  Edit,
  Trash2,
  X,
  SlidersHorizontal,
} from 'lucide-react';

interface InventoryRecipeManagerProps {
  branch: Branch;
  currentUser: User;
}

export const InventoryRecipeManager: React.FC<InventoryRecipeManagerProps> = ({
  branch,
  currentUser,
}) => {
  const { styles } = useAppTheme();
  const money = (amount: number) => formatCurrency(amount, branch.currencySymbol);
  const [activeTab, setActiveTab] = useState<'stock' | 'recipes'>('stock');
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [ingredients, setIngredients] = useState<Ingredient[]>(() =>
    sqliteService.getIngredients(branch.id)
  );
  const [recipes, setRecipes] = useState<Recipe[]>(() => sqliteService.getRecipes());
  const products = sqliteService.getProducts();

  // Stock Adjustment Modal
  const [adjustingIngredient, setAdjustingIngredient] = useState<Ingredient | null>(null);
  const [newStockVal, setNewStockVal] = useState('');
  const [adjustReason, setAdjustReason] = useState('Stock Count Verification');
  const [restockingIngredient, setRestockingIngredient] = useState<Ingredient | null>(null);
  const [restockQuantity, setRestockQuantity] = useState('');
  const [restockUnitCost, setRestockUnitCost] = useState('');
  const [restockNote, setRestockNote] = useState('');
  const [restockSupplier, setRestockSupplier] = useState('');
  const [restockPaymentMethod, setRestockPaymentMethod] = useState('cash');
  const [restockPaymentReference, setRestockPaymentReference] = useState('');
  const [quickPurchases, setQuickPurchases] = useState<QuickStockPurchase[]>(() => sqliteService.getQuickStockPurchases(branch.id));
  const [varianceIngredient, setVarianceIngredient] = useState<Ingredient | null>(null);
  const [varianceType, setVarianceType] = useState<'wastage' | 'spoilage' | 'damage'>('wastage');
  const [varianceQuantity, setVarianceQuantity] = useState('');
  const [varianceReason, setVarianceReason] = useState('');
  const [varianceHistory, setVarianceHistory] = useState<InventoryVarianceRecord[]>([]);
  const [inventoryError, setInventoryError] = useState('');

  // Add / Edit Ingredient Modal State
  const [isIngModalOpen, setIsIngModalOpen] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null);
  const [ingName, setIngName] = useState('');
  const [ingSku, setIngSku] = useState('');
  const [ingCategory, setIngCategory] = useState('Meat');
  const [ingUnit, setIngUnit] = useState<'kg' | 'g' | 'litre' | 'ml' | 'piece' | 'box'>('piece');
  const [ingStock, setIngStock] = useState('50');
  const [ingMin, setIngMin] = useState('15');
  const [ingUnitCost, setIngUnitCost] = useState('1.50');

  // Add / Edit Recipe Modal State
  const [isRecipeModalOpen, setIsRecipeModalOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id || '');
  const [recipeWastage, setRecipeWastage] = useState('3.0');
  const [recipeItems, setRecipeItems] = useState<RecipeItem[]>([]);
  const [selIngredientId, setSelIngredientId] = useState(ingredients[0]?.id || '');
  const [selIngQty, setSelIngQty] = useState('1');

  const refreshData = () => {
    setIngredients(sqliteService.getIngredients(branch.id));
    setRecipes(sqliteService.getRecipes());
    setQuickPurchases(sqliteService.getQuickStockPurchases(branch.id));
    void sqliteService.getInventoryReport(branch.id, currentUser).then((report) => setVarianceHistory(report.recentVariances)).catch((error: unknown) => setInventoryError(error instanceof Error ? error.message : 'Unable to load inventory report.'));
  };

  const handleOpenAdjust = (ing: Ingredient) => {
    setAdjustingIngredient(ing);
    setNewStockVal(ing.currentStock.toString());
  };

  const handleSaveAdjustment = async () => {
    if (!adjustingIngredient) return;
    const numericStock = parseFloat(newStockVal);
    if (isNaN(numericStock) || numericStock < 0) return;

    try { await sqliteService.adjustIngredientStock(
      adjustingIngredient.id,
      numericStock,
      adjustReason,
      currentUser
    ); setAdjustingIngredient(null); refreshData(); } catch (error) { setInventoryError(error instanceof Error ? error.message : 'Unable to save stock count.'); }
  };

  const handleOpenQuickRestock = (ingredient: Ingredient) => {
    setRestockingIngredient(ingredient);
    setRestockQuantity('');
    setRestockUnitCost(ingredient.unitCost.toString());
    setRestockNote('');
    setRestockSupplier('');
    setRestockPaymentMethod('cash');
    setRestockPaymentReference('');
    setInventoryError('');
  };

  const handleQuickRestock = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!restockingIngredient) return;
    const quantity = Number(restockQuantity);
    const unitCost = Number(restockUnitCost);
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost < 0) {
      setInventoryError('Enter a positive quantity and a valid unit cost.');
      return;
    }
    try {
      await sqliteService.quickRestockIngredient(restockingIngredient.id, quantity, unitCost, restockNote, restockSupplier, restockPaymentMethod, restockPaymentReference, currentUser);
      setRestockingIngredient(null);
      refreshData();
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : 'Unable to restock this ingredient.');
    }
  };

  const handleSaveVariance = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!varianceIngredient || Number(varianceQuantity) <= 0 || !varianceReason.trim()) return;
    try { await sqliteService.recordInventoryVariance(varianceIngredient.id, varianceType, Number(varianceQuantity), varianceReason, currentUser); setVarianceIngredient(null); setVarianceQuantity(''); setVarianceReason(''); refreshData(); } catch (error) { setInventoryError(error instanceof Error ? error.message : 'Unable to record inventory variance.'); }
  };

  // Open Add Ingredient
  const handleOpenAddIng = () => {
    setEditingIngredient(null);
    setIngName('');
    setIngSku(`ING-${Date.now().toString().slice(-4)}`);
    setIngCategory('Meat');
    setIngUnit('piece');
    setIngStock('50');
    setIngMin('15');
    setIngUnitCost('1.50');
    setIsIngModalOpen(true);
  };

  // Open Edit Ingredient
  const handleOpenEditIng = (ing: Ingredient) => {
    setEditingIngredient(ing);
    setIngName(ing.name);
    setIngSku(ing.sku);
    setIngCategory(ing.category);
    setIngUnit(ing.unit);
    setIngStock(ing.currentStock.toString());
    setIngMin(ing.minThreshold.toString());
    setIngUnitCost(ing.unitCost.toString());
    setIsIngModalOpen(true);
  };

  const handleSaveIngredient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ingName.trim()) return;
    setInventoryError('');
    const ingredientDetails = {
      name: ingName,
      sku: ingSku || `ING-${Date.now().toString().slice(-4)}`,
      category: ingCategory,
      unit: ingUnit,
      currentStock: parseFloat(ingStock) || 0,
      minThreshold: parseFloat(ingMin) || 10,
      unitCost: parseFloat(ingUnitCost) || 0,
    };
    try {
      if (editingIngredient) await sqliteService.updateIngredient(editingIngredient.id, ingredientDetails, currentUser);
      else await sqliteService.addIngredient({ ...ingredientDetails, branchId: branch.id }, currentUser);
      setIsIngModalOpen(false);
      refreshData();
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : 'Unable to save the ingredient.');
    }
  };

  const handleDeleteIngredient = async (ing: Ingredient) => {
    if (window.confirm(`Delete ingredient "${ing.name}" from inventory?`)) {
      setInventoryError('');
      try {
        await sqliteService.deleteIngredient(ing.id, currentUser);
        refreshData();
      } catch (error) {
        setInventoryError(error instanceof Error ? error.message : 'Unable to delete the ingredient.');
      }
    }
  };

  // Recipe Add / Edit Handlers
  const handleOpenAddRecipe = () => {
    setEditingRecipe(null);
    setSelectedProductId(products[0]?.id || '');
    setRecipeWastage('3.0');
    setRecipeItems([]);
    setSelIngredientId(ingredients[0]?.id || '');
    setSelIngQty('1');
    setIsRecipeModalOpen(true);
  };

  const handleOpenEditRecipe = (rec: Recipe) => {
    setEditingRecipe(rec);
    setSelectedProductId(rec.productId);
    setRecipeWastage(rec.wastagePercent.toString());
    setRecipeItems([...rec.items]);
    setSelIngredientId(ingredients[0]?.id || '');
    setSelIngQty('1');
    setIsRecipeModalOpen(true);
  };

  const handleAddRecipeItem = () => {
    const targetIng = ingredients.find((i) => i.id === selIngredientId);
    if (!targetIng) return;
    const qty = parseFloat(selIngQty) || 1;
    const cost = +(targetIng.unitCost * qty).toFixed(2);

    setRecipeItems([
      ...recipeItems,
      {
        ingredientId: targetIng.id,
        ingredientName: targetIng.name,
        quantity: qty,
        unit: targetIng.unit,
        unitCost: targetIng.unitCost,
        totalCost: cost,
      },
    ]);
  };

  const handleRemoveRecipeItem = (index: number) => {
    setRecipeItems(recipeItems.filter((_, i) => i !== index));
  };

  const handleSaveRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    const prod = products.find((p) => p.id === selectedProductId);
    if (!prod || recipeItems.length === 0) return;

    const rawCost = recipeItems.reduce((sum, item) => sum + item.totalCost, 0);
    const wastage = parseFloat(recipeWastage) || 0;
    const calculatedCost = +(rawCost * (1 + wastage / 100)).toFixed(2);
    const foodCostPercent = +((calculatedCost / prod.basePrice) * 100).toFixed(1);

    setInventoryError('');
    const recipeDetails = { productId: prod.id, productName: prod.name, items: recipeItems, wastagePercent: wastage, calculatedCost, sellingPrice: prod.basePrice, foodCostPercent };
    try {
      if (editingRecipe) await sqliteService.updateRecipe(editingRecipe.id, recipeDetails, currentUser);
      else await sqliteService.createRecipe(recipeDetails, currentUser);
      setIsRecipeModalOpen(false);
      refreshData();
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : 'Unable to save the recipe.');
    }
  };

  const handleDeleteRecipe = async (rec: Recipe) => {
    if (window.confirm(`Delete recipe for "${rec.productName}"?`)) {
      setInventoryError('');
      try {
        await sqliteService.deleteRecipe(rec.id, currentUser);
        refreshData();
      } catch (error) {
        setInventoryError(error instanceof Error ? error.message : 'Unable to delete the recipe.');
      }
    }
  };

  const lowStockCount = ingredients.filter((i) => i.currentStock <= i.minThreshold).length;
  const displayedIngredients = showLowStockOnly
    ? ingredients.filter((ingredient) => ingredient.currentStock <= ingredient.minThreshold)
    : ingredients;

  return (
    <div className={`flex-1 flex flex-col h-full min-h-0 gap-4 p-4 ${styles.bgApp} overflow-hidden`}>
      {/* Header & Tabs */}
      <div className={`p-4 rounded-2xl ${styles.bgSurface} border ${styles.borderDefault} flex flex-wrap items-center justify-between gap-4 shadow-[0_8px_24px_-18px_rgba(24,48,45,0.32)]`}>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[#E8F3F0] border border-[#B9D8D0] text-[#16665A]">
            <Boxes className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Inventory & Recipe Management</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Real-Time Stock Depletion, Food Cost Analysis, Ingredients Master & BOM
            </p>
          </div>
        </div>

        {/* Action Controls & Tab Switch */}
        <div className="flex items-center gap-2">
          {lowStockCount > 0 && (
            <button
              type="button"
              onClick={() => { setActiveTab('stock'); setShowLowStockOnly((current) => !current); }}
              aria-pressed={showLowStockOnly}
              title={showLowStockOnly ? 'Show all ingredients' : 'Show only low-stock ingredients'}
              className={`flex items-center gap-1.5 px-3 py-1 border rounded-xl text-xs font-bold cursor-pointer transition ${showLowStockOnly ? 'bg-rose-600 border-rose-700 text-white shadow-xs' : 'bg-rose-100 border-rose-300 text-rose-800 hover:bg-rose-200'}`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{showLowStockOnly ? `Showing ${lowStockCount} Low Stock` : `${lowStockCount} Low Stock Alert${lowStockCount > 1 ? 's' : ''}`}</span>
            </button>
          )}

          {activeTab === 'stock' ? (
            <button
              type="button"
              onClick={handleOpenAddIng}
              className="px-3.5 py-1.5 bg-[#16665A] hover:bg-[#115448] text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Add Raw Ingredient</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleOpenAddRecipe}
              className="px-3.5 py-1.5 bg-[#16665A] hover:bg-[#115448] text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Create Recipe (BOM)</span>
            </button>
          )}

          <div className="flex items-center gap-1 bg-slate-200/60 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('stock')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                activeTab === 'stock'
                  ? 'bg-[#16665A] text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Boxes className="w-3.5 h-3.5" />
              <span>Stock Master ({ingredients.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('recipes')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                activeTab === 'recipes'
                  ? 'bg-[#16665A] text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Scroll className="w-3.5 h-3.5" />
              <span>Recipes & BOM ({recipes.length})</span>
            </button>
          </div>
        </div>
      </div>

      {inventoryError && <div className="px-4 py-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-xs flex justify-between"><span>{inventoryError}</span><button type="button" onClick={() => setInventoryError('')} className="font-bold">Dismiss</button></div>}

      {/* Main Tab Content */}
      <div className="flex-1 min-h-0 p-1 overflow-y-auto">
        {activeTab === 'stock' ? (
          /* Stock Master Table */
          <div className="space-y-6">
          <div className={`${styles.bgCard} border ${styles.borderDefault} rounded-2xl overflow-hidden shadow-xs`}>
            <div className={`px-6 py-4 border-b ${styles.borderDefault} flex items-center justify-between`}>
              <div>
                <h3 className="font-bold text-sm text-slate-900">Raw Ingredients & Food Supplies</h3>
                <p className="text-xs text-slate-500">{showLowStockOnly ? 'Showing ingredients at or below their reorder threshold.' : 'Auto-depletes in local database when orders are placed and confirmed at POS'}</p>
              </div>
              <button
                type="button"
                onClick={refreshData}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh Stock</span>
              </button>
              {showLowStockOnly && <button type="button" onClick={() => setShowLowStockOnly(false)} className="px-3 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200 cursor-pointer">Clear low-stock filter</button>}
            </div>

            <div className="overflow-x-auto">
              {varianceHistory.length > 0 && <div className="px-6 py-3 bg-rose-50 border-b border-rose-100 text-xs text-rose-800"><strong>Recent variance:</strong> {varianceHistory[0].ingredientName} · {varianceHistory[0].movementType.replace('_', ' ')} · {Math.abs(varianceHistory[0].quantityDelta)} · {varianceHistory[0].reason}</div>}
              {quickPurchases.length > 0 && <div className="px-6 py-3 bg-emerald-50 border-b border-emerald-100 text-xs text-emerald-900"><strong>Latest direct stock purchase:</strong> {quickPurchases[0].purchaseNumber} · {quickPurchases[0].ingredientName} · {quickPurchases[0].quantity} {quickPurchases[0].unit} · {money(quickPurchases[0].totalAmount)} via {quickPurchases[0].paymentMethod.replace(/_/g, ' ')} <span className="text-emerald-700">(also included in Analytics & Reports)</span></div>}
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 uppercase tracking-wider font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3">Ingredient</th>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3 text-right">Current Stock</th>
                    <th className="px-4 py-3 text-right">Min Threshold</th>
                    <th className="px-4 py-3 text-right">Unit Cost</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayedIngredients.map((ing) => {
                    const isLow = ing.currentStock <= ing.minThreshold;
                    return (
                      <tr key={ing.id} className="hover:bg-slate-50/70 transition">
                        <td className="px-6 py-3 font-bold text-slate-900">{ing.name}</td>
                        <td className="px-4 py-3 font-mono text-slate-500">{ing.sku}</td>
                        <td className="px-4 py-3 text-slate-700">
                          <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px]">
                            {ing.category}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                          {ing.currentStock} {ing.unit}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-500">
                          {ing.minThreshold} {ing.unit}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-700">
                          {money(ing.unitCost)} / {ing.unit}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isLow ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                              REORDER
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              OPTIMAL
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenQuickRestock(ing)}
                              className="px-2 py-1 text-xs font-semibold text-emerald-800 hover:text-emerald-950 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition cursor-pointer"
                              title="Receive stock without a purchase order"
                            >
                              Restock
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenAdjust(ing)}
                              className="px-2 py-1 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 transition cursor-pointer"
                              title="Count Adjustment"
                            >
                              Adjust
                            </button>
                            <button type="button" onClick={() => setVarianceIngredient(ing)} className="px-2 py-1 text-xs font-semibold text-rose-700 bg-rose-50 rounded-lg border border-rose-200" title="Record wastage, spoilage, or damage">Waste</button>
                            <button
                              type="button"
                              onClick={() => handleOpenEditIng(ing)}
                              className="p-1 text-slate-600 hover:text-amber-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                              title="Edit Ingredient"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteIngredient(ing)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                              title="Delete Ingredient"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {displayedIngredients.length === 0 && (
                    <tr><td colSpan={8} className="px-6 py-10 text-center text-sm text-slate-500">No ingredients match the current stock filter.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          {quickPurchases.length > 0 && <div className={`${styles.bgCard} border ${styles.borderDefault} rounded-2xl overflow-hidden shadow-xs`}>
            <div className={`px-6 py-4 border-b ${styles.borderDefault}`}>
              <h3 className="font-bold text-sm text-slate-900">Direct Stock Purchase History</h3>
              <p className="text-xs text-slate-500">Every quick restock is retained here separately from supplier purchase orders and operating expenses.</p>
            </div>
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 text-slate-600 uppercase tracking-wider font-semibold border-b border-slate-200">
                  <tr><th className="px-6 py-3">Purchase</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Ingredient</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Payment</th><th className="px-4 py-3 text-right">Quantity</th><th className="px-4 py-3 text-right">Unit Cost</th><th className="px-6 py-3 text-right">Total</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {quickPurchases.map((purchase) => <tr key={purchase.id} className="hover:bg-slate-50/70">
                    <td className="px-6 py-3 font-mono font-semibold text-slate-900">{purchase.purchaseNumber}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{new Date(purchase.purchasedAt).toLocaleString()}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{purchase.ingredientName}</td>
                    <td className="px-4 py-3 text-slate-600">{purchase.supplierName || '—'}</td>
                    <td className="px-4 py-3 text-slate-600 capitalize">{purchase.paymentMethod.replace(/_/g, ' ')}{purchase.paymentReference ? ` · ${purchase.paymentReference}` : ''}</td>
                    <td className="px-4 py-3 text-right font-mono">{purchase.quantity} {purchase.unit}</td>
                    <td className="px-4 py-3 text-right font-mono">{money(purchase.unitCost)}</td>
                    <td className="px-6 py-3 text-right font-mono font-bold text-slate-900">{money(purchase.totalAmount)}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          </div>}
          </div>
        ) : (
          /* Recipes & Bill of Materials Grid */
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {recipes.map((rec) => {
                const grossProfit = +(rec.sellingPrice - rec.calculatedCost).toFixed(2);
                return (
                  <div
                    key={rec.id}
                    className={`${styles.bgCard} border ${styles.borderDefault} rounded-2xl p-5 shadow-xs flex flex-col justify-between`}
                  >
                    <div>
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-[10px] font-mono text-amber-700 font-bold uppercase">
                            Recipe #{rec.id}
                          </span>
                          <h4 className="text-base font-bold text-slate-900 mt-0.5">
                            {rec.productName}
                          </h4>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                              rec.foodCostPercent <= 30
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : 'bg-amber-100 text-amber-800 border border-amber-200'
                            }`}
                          >
                            {rec.foodCostPercent.toFixed(1)}% Cost
                          </span>

                          <button
                            type="button"
                            onClick={() => handleOpenEditRecipe(rec)}
                            className="p-1 text-slate-500 hover:text-amber-700 hover:bg-slate-100 rounded-md transition cursor-pointer"
                            title="Edit Recipe"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteRecipe(rec)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition cursor-pointer"
                            title="Delete Recipe"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Ingredients Bill of Materials List */}
                      <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">
                          Bill of Materials (BOM)
                        </span>
                        <div className="divide-y divide-slate-100">
                          {rec.items.map((item, idx) => (
                            <div
                              key={idx}
                              className="py-1.5 flex items-center justify-between text-xs"
                            >
                              <div className="text-slate-800">
                                <span>{item.ingredientName}</span>
                                <span className="text-[10px] text-slate-500 block">
                                  {item.quantity} {item.unit} @ {money(item.unitCost)}
                                </span>
                              </div>
                              <span className="font-mono text-slate-700">
                                {money(item.totalCost)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Financial Calculations Box */}
                    <div className="mt-4 pt-3 border-t border-slate-100 bg-slate-50 p-3 rounded-xl space-y-1.5 text-xs">
                      <div className="flex justify-between text-slate-600">
                        <span>Calculated Food Cost:</span>
                        <span className="font-mono font-bold text-rose-700">
                          {money(rec.calculatedCost)}
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Selling Price:</span>
                        <span className="font-mono font-bold text-emerald-700">
                          {money(rec.sellingPrice)}
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-900 font-bold pt-1 border-t border-slate-200">
                        <span>Gross Profit Margin:</span>
                        <span className="font-mono text-amber-700">
                          {money(grossProfit)} (
                          {(((grossProfit) / rec.sellingPrice) * 100).toFixed(0)}%)
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit Raw Ingredient Modal */}
      {isIngModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#18302D]/45 backdrop-blur-sm p-4">
          <div className="bg-[#FFFDFC] rounded-2xl shadow-[0_24px_64px_-28px_rgba(24,48,45,0.55)] max-w-md w-full overflow-hidden border border-[#E8E3DA] p-6 space-y-4">
            <h3 className="font-extrabold text-base text-[#18302D]">
              {editingIngredient ? 'Edit Raw Ingredient' : 'Add Raw Ingredient'}
            </h3>
            <form onSubmit={handleSaveIngredient} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Ingredient Name *</label>
                <input
                  type="text"
                  value={ingName}
                  onChange={(e) => setIngName(e.target.value)}
                  placeholder="e.g. Grass-fed Beef Patty, Blue Cheese"
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Category</label>
                  <select
                    value={ingCategory}
                    onChange={(e) => setIngCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-800"
                  >
                    <option value="Meat">Meat & Poultry</option>
                    <option value="Dairy">Dairy & Cheese</option>
                    <option value="Bakery">Bakery & Dough</option>
                    <option value="Produce">Produce & Vegetables</option>
                    <option value="Sauces">Sauces & Condiments</option>
                    <option value="Frozen">Frozen Supplies</option>
                    <option value="Beverage">Beverages & Coffee</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Measurement Unit</label>
                  <select
                    value={ingUnit}
                    onChange={(e) => setIngUnit(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-800"
                  >
                    <option value="piece">Piece (pcs)</option>
                    <option value="kg">Kilogram (kg)</option>
                    <option value="g">Gram (g)</option>
                    <option value="litre">Litre (L)</option>
                    <option value="ml">Millilitre (ml)</option>
                    <option value="box">Box / Pack</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Current Stock</label>
                  <input
                    type="number"
                    step="0.01"
                    value={ingStock}
                    onChange={(e) => setIngStock(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-slate-900 font-bold"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Min Threshold</label>
                  <input
                    type="number"
                    step="0.01"
                    value={ingMin}
                    onChange={(e) => setIngMin(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Unit Cost ({branch.currencySymbol || 'PKR'})</label>
                  <input
                    type="number"
                    step="0.01"
                    value={ingUnitCost}
                    onChange={(e) => setIngUnitCost(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-slate-900 font-bold"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#E8E3DA]">
                <button
                  type="button"
                  onClick={() => setIsIngModalOpen(false)}
                  className="px-3.5 py-1.5 text-[#35514C] hover:bg-[#E8F3F0] hover:text-[#16665A] rounded-xl font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#16665A] hover:bg-[#115448] text-white font-bold rounded-xl shadow-sm cursor-pointer"
                >
                  {editingIngredient ? 'Save Changes' : 'Save Ingredient'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create / Edit Recipe Modal */}
      {isRecipeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#18302D]/45 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-[#FFFDFC] rounded-2xl shadow-[0_24px_64px_-28px_rgba(24,48,45,0.55)] max-w-lg w-full overflow-hidden border border-[#E8E3DA] p-6 space-y-4">
            <h3 className="font-extrabold text-base text-[#18302D]">
              {editingRecipe ? 'Edit Recipe Bill of Materials (BOM)' : 'Create Recipe Bill of Materials (BOM)'}
            </h3>
            <p className="text-xs text-slate-500">
              Link a menu item to its constituent ingredients for automated stock depletion and food cost % calculation.
            </p>

            <form onSubmit={handleSaveRecipe} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Select Menu Item *</label>
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-800"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({money(p.basePrice)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Preparation Wastage Factor (%)</label>
                <input
                  type="number"
                  step="0.5"
                  value={recipeWastage}
                  onChange={(e) => setRecipeWastage(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-slate-900"
                />
              </div>

              {/* Add Ingredient items to BOM */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <span className="font-bold text-slate-800 block">Add Ingredients to Recipe</span>
                <div className="flex gap-2">
                  <select
                    value={selIngredientId}
                    onChange={(e) => setSelIngredientId(e.target.value)}
                    className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800"
                  >
                    {ingredients.map((ing) => (
                      <option key={ing.id} value={ing.id}>
                        {ing.name} ({money(ing.unitCost)}/{ing.unit})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    value={selIngQty}
                    onChange={(e) => setSelIngQty(e.target.value)}
                    placeholder="Qty"
                    className="w-20 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800 font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleAddRecipeItem}
                    className="px-3 py-1.5 bg-[#16665A] text-white font-bold rounded-lg hover:bg-[#115448] cursor-pointer"
                  >
                    + Add
                  </button>
                </div>

                {recipeItems.length > 0 && (
                  <div className="divide-y divide-slate-200 pt-2 max-h-40 overflow-y-auto">
                    {recipeItems.map((item, idx) => (
                      <div key={idx} className="py-1 flex items-center justify-between">
                        <span>{item.quantity} {item.unit} {item.ingredientName}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold">{money(item.totalCost)}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveRecipeItem(idx)}
                            className="text-rose-500 hover:text-rose-700 text-xs cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#E8E3DA]">
                <button
                  type="button"
                  onClick={() => setIsRecipeModalOpen(false)}
                  className="px-3.5 py-1.5 text-[#35514C] hover:bg-[#E8F3F0] hover:text-[#16665A] rounded-xl font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={recipeItems.length === 0}
                  className="px-4 py-2 bg-[#16665A] hover:bg-[#115448] disabled:opacity-40 text-white font-bold rounded-xl shadow-sm cursor-pointer"
                >
                  {editingRecipe ? 'Update Recipe' : 'Save Recipe'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {varianceIngredient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-2xs p-4"><div className="bg-white border border-slate-200 rounded-2xl shadow-xl max-w-md w-full p-6"><h3 className="font-bold text-base text-slate-900">Record Inventory Variance</h3><p className="text-xs text-slate-500 mt-1">{varianceIngredient.name}: available {varianceIngredient.currentStock} {varianceIngredient.unit}</p><form onSubmit={handleSaveVariance} className="space-y-3 mt-4 text-xs"><label className="block">Type<select value={varianceType} onChange={(e) => setVarianceType(e.target.value as 'wastage' | 'spoilage' | 'damage')} className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-xl"><option value="wastage">Preparation wastage</option><option value="spoilage">Spoilage / expired</option><option value="damage">Damage / breakage</option></select></label><label className="block">Quantity ({varianceIngredient.unit})<input required type="number" min="0.001" max={varianceIngredient.currentStock} step="0.001" value={varianceQuantity} onChange={(e) => setVarianceQuantity(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-xl font-mono" /></label><label className="block">Reason<input required value={varianceReason} onChange={(e) => setVarianceReason(e.target.value)} placeholder="Explain the variance" className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-xl" /></label><div className="flex justify-end gap-2"><button type="button" onClick={() => setVarianceIngredient(null)} className="px-4 py-2 text-slate-600">Cancel</button><button type="submit" className="px-5 py-2 bg-rose-600 text-white font-bold rounded-xl">Record Variance</button></div></form></div></div>
      )}

      {/* Quick restock: inventory receipt with no supplier purchase order. */}
      {restockingIngredient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#18302D]/45 backdrop-blur-sm p-4">
          <div className="bg-[#FFFDFC] border border-[#E8E3DA] rounded-2xl shadow-[0_24px_64px_-28px_rgba(24,48,45,0.55)] max-w-md w-full overflow-hidden text-[#18302D] p-6">
            <h3 className="font-extrabold text-base text-[#18302D]">Quick Restock</h3>
            <p className="mt-1 text-xs text-slate-500">Receive <strong className="text-slate-900">{restockingIngredient.name}</strong> directly into stock. This creates a direct stock-purchase record, but does not create a supplier purchase order or balance.</p>
            <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">Current on hand: <strong>{restockingIngredient.currentStock} {restockingIngredient.unit}</strong>. The recorded unit cost updates the ingredient's moving-average cost and the purchase total is saved for analytics.</div>
            <form onSubmit={handleQuickRestock} className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-slate-700">Quantity received ({restockingIngredient.unit})
                  <input required autoFocus type="number" min="0.0001" max="1000000" step="0.0001" value={restockQuantity} onChange={(event) => setRestockQuantity(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-slate-900" />
                </label>
                <label className="block text-slate-700">Unit cost ({branch.currencySymbol || 'PKR'})
                  <input required type="number" min="0" max="10000000" step="0.0001" value={restockUnitCost} onChange={(event) => setRestockUnitCost(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-slate-900" />
                </label>
              </div>
              <label className="block text-slate-700">Note <span className="text-slate-400">(optional)</span>
                <input value={restockNote} maxLength={500} onChange={(event) => setRestockNote(event.target.value)} placeholder="e.g. Cash market purchase / emergency top-up" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-slate-700">Supplier / source <span className="text-slate-400">(optional)</span>
                  <input value={restockSupplier} maxLength={140} onChange={(event) => setRestockSupplier(event.target.value)} placeholder="e.g. Local market" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900" />
                </label>
                <label className="block text-slate-700">Payment method
                  <select value={restockPaymentMethod} onChange={(event) => setRestockPaymentMethod(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900"><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="easypaisa">Easypaisa</option><option value="jazzcash">JazzCash</option><option value="other">Other</option></select>
                </label>
              </div>
              <label className="block text-slate-700">Payment reference <span className="text-slate-400">(optional)</span>
                <input value={restockPaymentReference} maxLength={160} onChange={(event) => setRestockPaymentReference(event.target.value)} placeholder="Receipt, transfer, or invoice number" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900" />
              </label>
              <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-700"><div className="text-right">Direct purchase total: <strong className="font-mono text-slate-950">{money((Number(restockQuantity) || 0) * (Number(restockUnitCost) || 0))}</strong></div>{restockPaymentMethod === 'cash' && <p className="mt-1 text-amber-700">Cash is paid out of the open cash drawer. Choose another method if it was paid outside the drawer.</p>}</div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setRestockingIngredient(null)} className="px-4 py-2 text-[#35514C] hover:bg-[#E8F3F0] hover:text-[#16665A] rounded-xl cursor-pointer">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-[#16665A] text-white font-bold rounded-xl hover:bg-[#115448] cursor-pointer">Receive Stock</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manual Stock Adjustment Modal */}
      {adjustingIngredient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#18302D]/45 backdrop-blur-sm p-4">
          <div className="bg-[#FFFDFC] border border-[#E8E3DA] rounded-2xl shadow-[0_24px_64px_-28px_rgba(24,48,45,0.55)] max-w-sm w-full overflow-hidden text-[#18302D] p-5 space-y-4">
            <h3 className="font-extrabold text-base text-[#18302D]">Manual Stock Adjustment</h3>
            <p className="text-xs text-slate-500">
              Update inventory for <strong className="text-slate-900">{adjustingIngredient.name}</strong>
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 mb-1">
                  New Physical Count ({adjustingIngredient.unit})
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={newStockVal}
                  onChange={(e) => setNewStockVal(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono font-bold bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1">Reason / Justification</label>
                <select
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-800 focus:outline-none"
                >
                  <option value="Physical Stock Count Variance">Physical Stock Count Variance</option>
                  <option value="Damaged / Expired Goods">Damaged / Expired Goods</option>
                  <option value="Kitchen Spillage / Waste">Kitchen Spillage / Waste</option>
                  <option value="Emergency Purchase Delivery">Emergency Purchase Delivery</option>
                </select>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setAdjustingIngredient(null)}
                className="px-3.5 py-2 text-xs text-slate-500 hover:text-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAdjustment}
                className="px-4 py-2 bg-[#16665A] hover:bg-[#115448] text-white font-bold text-xs rounded-xl shadow-sm transition cursor-pointer"
              >
                Confirm Adjustment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
