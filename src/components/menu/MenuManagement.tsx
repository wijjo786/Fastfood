import React, { useState } from 'react';
import { Product, Category, User, ProductVariation, ProductModifier, KitchenStation, Branch } from '../../types/restaurant';
import { sqliteService } from '../../services/sqliteStorage';
import { useAppTheme } from '../../context/ThemeContext';
import { formatCurrency } from '../../utils/currency';
import { showUserInfo } from '../../utils/userFeedback';
import {
  Utensils,
  Plus,
  Edit,
  Trash2,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Flame,
  ChefHat,
  X,
  Save,
  Tag,
  FolderPlus,
  Layers,
  Upload,
  Image as ImageIcon,
} from 'lucide-react';

interface MenuManagementProps {
  branch: Branch;
  currentUser: User;
  onRefreshPosMenu?: () => void;
}

const offlineProductImage = (imageUrl: string) => /^(?:restoflow-media:|data:image\/)/i.test(imageUrl) ? imageUrl : '';

export const MenuManagement: React.FC<MenuManagementProps> = ({ branch, currentUser, onRefreshPosMenu }) => {
  const { styles } = useAppTheme();
  const money = (amount: number) => formatCurrency(amount, branch.currencySymbol);
  const [products, setProducts] = useState<Product[]>(() => sqliteService.getProducts());
  const [categories, setCategories] = useState<Category[]>(() => sqliteService.getCategories());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Product Add / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Category Add / Edit Modal State
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('Utensils');

  // Product Form Fields
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id || 'cat-burgers');
  const [basePrice, setBasePrice] = useState('10.99');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [prepTimeMinutes, setPrepTimeMinutes] = useState('8');
  const [kitchenStation, setKitchenStation] = useState<KitchenStation>('grill');
  const [featured, setFeatured] = useState(false);
  const [isAvailable, setIsAvailable] = useState(true);

  // Variations & Modifiers in form
  const [variations, setVariations] = useState<ProductVariation[]>([]);
  const [modifiers, setModifiers] = useState<ProductModifier[]>([]);
  const [varName, setVarName] = useState('');
  const [varPriceDiff, setVarPriceDiff] = useState('0');
  const [modName, setModName] = useState('');
  const [modPrice, setModPrice] = useState('1.50');

  const refreshData = () => {
    setProducts(sqliteService.getProducts());
    setCategories(sqliteService.getCategories());
    if (onRefreshPosMenu) onRefreshPosMenu();
  };

  const handleOpenAdd = () => {
    setEditingProduct(null);
    setName('');
    setCategoryId(categories[0]?.id || 'cat-burgers');
    setBasePrice('11.50');
    setSku(`ITM-${Date.now().toString().slice(-4)}`);
    setBarcode(`89012345${Math.floor(1000 + Math.random() * 9000)}`);
    setDescription('Chef-crafted artisanal recipe with fresh local ingredients.');
    setImageUrl('');
    setPrepTimeMinutes('8');
    setKitchenStation('grill');
    setFeatured(false);
    setIsAvailable(true);
    setVariations([]);
    setModifiers([]);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (p: Product) => {
    setEditingProduct(p);
    setName(p.name);
    setCategoryId(p.categoryId);
    setBasePrice(p.basePrice.toString());
    setSku(p.sku);
    setBarcode(p.barcode);
    setDescription(p.description);
    setImageUrl(p.imageUrl);
    setPrepTimeMinutes(p.prepTimeMinutes.toString());
    setKitchenStation(p.kitchenStation);
    setFeatured(p.featured);
    setIsAvailable(p.isAvailable);
    setVariations([...p.variations]);
    setModifiers([...p.modifiers]);
    setIsModalOpen(true);
  };

  const handleAddVariation = () => {
    if (!varName.trim()) return;
    setVariations([
      ...variations,
      {
        id: `var-${Date.now()}`,
        name: varName,
        priceDifference: parseFloat(varPriceDiff) || 0,
      },
    ]);
    setVarName('');
    setVarPriceDiff('0');
  };

  const handleRemoveVariation = (id: string) => {
    setVariations(variations.filter((v) => v.id !== id));
  };

  const handleAddModifier = () => {
    if (!modName.trim()) return;
    setModifiers([
      ...modifiers,
      {
        id: `mod-${Date.now()}`,
        name: modName,
        price: parseFloat(modPrice) || 0,
      },
    ]);
    setModName('');
    setModPrice('1.50');
  };

  const handleRemoveModifier = (id: string) => {
    setModifiers(modifiers.filter((m) => m.id !== id));
  };

  const handleLocalImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showUserInfo('Choose an image smaller than 5 MB, then try again.', 'Image not selected');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (base64) {
        setImageUrl(base64);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const priceNum = parseFloat(basePrice);
    if (!name.trim() || isNaN(priceNum) || priceNum <= 0) return;
    setActionError(null);
    setIsSaving(true);
    const productDetails = {
      name,
      categoryId,
      basePrice: priceNum,
      sku,
      barcode,
      description,
      imageUrl,
      prepTimeMinutes: parseInt(prepTimeMinutes) || 8,
      kitchenStation,
      featured,
      isAvailable,
      variations,
      modifiers,
    };
    try {
      if (editingProduct) await sqliteService.updateProduct(editingProduct.id, productDetails, currentUser);
      else await sqliteService.addProduct(productDetails, currentUser);
      setIsModalOpen(false);
      refreshData();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to save the menu item.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleAvailability = async (p: Product) => {
    setActionError(null);
    try {
      await sqliteService.updateProduct(p.id, { isAvailable: !p.isAvailable }, currentUser);
      refreshData();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to update menu item availability.');
    }
  };

  const handleDelete = async (p: Product) => {
    if (window.confirm(`Are you sure you want to remove "${p.name}" from the active menu?`)) {
      setActionError(null);
      try {
        await sqliteService.deleteProduct(p.id, currentUser);
        refreshData();
      } catch (error) {
        setActionError(error instanceof Error ? error.message : 'Unable to remove the menu item.');
      }
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    setActionError(null);
    setIsSaving(true);
    try {
      await sqliteService.addCategory(
        {
          name: newCatName.trim(),
          slug: newCatName.toLowerCase().replace(/\s+/g, '-'),
          iconName: newCatIcon,
          displayOrder: categories.length + 1,
          active: true,
        },
        currentUser
      );
      setIsCatModalOpen(false);
      setNewCatName('');
      refreshData();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to create the menu category.');
    } finally {
      setIsSaving(false);
    }
  };

  const filtered = products.filter((p) => {
    const matchCat = selectedCategory === 'all' || p.categoryId === selectedCategory;
    const matchQuery =
      !searchQuery ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.barcode.includes(searchQuery);
    return matchCat && matchQuery;
  });

  return (
    <div className={`flex-1 flex flex-col h-full min-h-0 gap-4 p-4 ${styles.bgApp} overflow-hidden`}>
      {/* Header */}
      <div className={`p-4 rounded-2xl ${styles.bgSurface} border ${styles.borderDefault} flex flex-wrap items-center justify-between gap-4 shadow-[0_8px_24px_-18px_rgba(24,48,45,0.32)]`}>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[#E8F3F0] border border-[#B9D8D0] text-[#16665A]">
            <Utensils className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">Menu & Product Catalog Manager</h2>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                {products.length} Sellable Items
              </span>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-800 border border-sky-200">
                {categories.length} Categories
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Add Dishes, Variations, Modifier Add-ons, Pricing & Kitchen Station Routing
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsCatModalOpen(true)}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl border border-slate-300 transition flex items-center gap-1.5 cursor-pointer"
          >
            <FolderPlus className="w-4 h-4 text-slate-600" />
            <span>+ Add Category</span>
          </button>

          <button
            type="button"
            onClick={handleOpenAdd}
            className="px-4 py-2 bg-[#16665A] hover:bg-[#115448] text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add Menu Item</span>
          </button>
        </div>
      </div>

      {actionError && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">
          {actionError}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className={`px-4 py-3 rounded-2xl ${styles.bgSurface} border ${styles.borderDefault} flex flex-wrap items-center justify-between gap-3`}>
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-[#16665A] text-white font-bold shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Items ({products.length})
          </button>

          {categories.map((cat) => {
            const count = products.filter((p) => p.categoryId === cat.id).length;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  selectedCategory === cat.id
                    ? 'bg-[#16665A] text-white font-bold shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat.name} ({count})
              </button>
            );
          })}
        </div>

        <div className="relative w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, SKU, barcode..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {/* Product List Table */}
      <div className="flex-1 min-h-0 p-1 overflow-y-auto">
        <div className={`${styles.bgCard} border ${styles.borderDefault} rounded-2xl overflow-hidden shadow-xs`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase tracking-wider font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3">Menu Product</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">SKU / Station</th>
                  <th className="px-4 py-3 text-right">Base Price</th>
                  <th className="px-4 py-3 text-center">Variations / Add-ons</th>
                  <th className="px-4 py-3 text-center">POS Status</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((product) => {
                  const cat = categories.find((c) => c.id === product.categoryId);
                  return (
                    <tr key={product.id} className="hover:bg-slate-50/70 transition">
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-3">
                          {offlineProductImage(product.imageUrl) ? <img src={offlineProductImage(product.imageUrl)} alt={product.name} className="w-11 h-11 rounded-xl object-cover border border-slate-200" /> : <div className="w-11 h-11 rounded-xl border border-dashed border-slate-300 text-slate-400 flex items-center justify-center"><ImageIcon className="w-4 h-4" /></div>}
                          <div>
                            <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                              <span>{product.name}</span>
                              {product.featured && (
                                <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 text-[9px] font-bold">
                                  BESTSELLER
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-400 line-clamp-1 max-w-sm">
                              {product.description}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-semibold border border-slate-200">
                          {cat?.name || product.categoryId}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-mono font-bold text-slate-700">{product.sku}</div>
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-semibold uppercase mt-0.5 inline-block">
                          {product.kitchenStation} station ({product.prepTimeMinutes}m)
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-black text-sm text-slate-900">
                        {money(product.basePrice)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-[11px] text-slate-600">
                          {product.variations.length} sizes • {product.modifiers.length} extras
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleAvailability(product)}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition cursor-pointer ${
                            product.isAvailable
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                              : 'bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100'
                          }`}
                          title="Click to toggle availability on POS"
                        >
                          {product.isAvailable ? 'AVAILABLE ON POS' : 'OUT OF STOCK'}
                        </button>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(product)}
                            className="p-1.5 text-slate-600 hover:text-amber-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                            title="Edit Product"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(product)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            title="Delete Product"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add / Edit Product Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#18302D]/45 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-[#FFFDFC] rounded-2xl shadow-[0_24px_64px_-28px_rgba(24,48,45,0.55)] max-w-2xl w-full overflow-hidden border border-[#E8E3DA] my-8 flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 bg-[#F7F3EC] border-b border-[#E8E3DA] flex items-center justify-between">
              <h3 className="font-extrabold text-base text-[#18302D]">
                {editingProduct ? 'Edit Menu Product' : 'Add New Menu Product'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-[#71807C] hover:text-[#16665A] p-1.5 rounded-lg hover:bg-[#E8F3F0] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Product Name *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Crispy Chicken Deluxe"
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Category *</label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-800"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Base Price ({branch.currencySymbol || 'PKR'}) *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={basePrice}
                    onChange={(e) => setBasePrice(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">SKU Code</label>
                  <input
                    type="text"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Kitchen Station Routing</label>
                  <select
                    value={kitchenStation}
                    onChange={(e) => setKitchenStation(e.target.value as KitchenStation)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-800"
                  >
                    <option value="grill">🔥 Grill / Fryer</option>
                    <option value="pizza">🍕 Stone Pizza</option>
                    <option value="drinks">🥤 Drinks & Shakes</option>
                    <option value="packing">📦 Packing & Assembly</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900"
                />
              </div>

              {/* Local Image Upload and Options */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-slate-800 text-xs">
                    Product Dish Image (stored locally for offline use)
                  </label>
                  {imageUrl && (
                    <button
                      type="button"
                      onClick={() => setImageUrl('')}
                      className="text-[11px] text-rose-600 hover:text-rose-700 font-semibold cursor-pointer"
                    >
                      Remove Image
                    </button>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-4">
                  {/* Thumbnail Preview */}
                  <div className="w-24 h-24 rounded-xl border-2 border-dashed border-slate-300 bg-white overflow-hidden flex items-center justify-center shrink-0 shadow-2xs relative">
                    {offlineProductImage(imageUrl) ? (
                      <img
                        src={offlineProductImage(imageUrl)}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-center p-2 text-slate-400">
                        <ImageIcon className="w-8 h-8 mx-auto stroke-1" />
                        <span className="text-[9px] block mt-1">No Image</span>
                      </div>
                    )}
                  </div>

                  {/* Local Upload Button & Drop Area */}
                  <div className="flex-1 w-full space-y-2">
                    <div className="flex items-center gap-2">
                      <label
                        htmlFor="local-dish-file-input"
                        className="px-4 py-2 bg-[#16665A] hover:bg-[#115448] text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <Upload className="w-4 h-4" />
                        <span>Upload Image from Device</span>
                      </label>
                      <input
                        id="local-dish-file-input"
                        type="file"
                        accept="image/png, image/jpeg, image/webp, image/gif"
                        onChange={handleLocalImageUpload}
                        className="hidden"
                      />
                      <span className="text-[11px] text-slate-500">
                        JPG, PNG, WebP or GIF (max 5MB)
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={imageUrl.startsWith('data:') ? 'New local image ready to save' : imageUrl.startsWith('restoflow-media:') ? 'Stored locally in this RestoFlow installation' : imageUrl ? 'Legacy external image — upload a local replacement' : 'No image selected'}
                        readOnly
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-slate-600 text-xs"
                      />
                    </div>
                  </div>
                </div>

              </div>

              {/* Toggles */}
              <div className="flex items-center gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={featured}
                    onChange={(e) => setFeatured(e.target.checked)}
                    className="rounded text-amber-500 w-4 h-4 cursor-pointer"
                  />
                  <span className="text-slate-800 font-bold text-xs">Bestseller / Featured Tag</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isAvailable}
                    onChange={(e) => setIsAvailable(e.target.checked)}
                    className="rounded text-emerald-500 w-4 h-4 cursor-pointer"
                  />
                  <span className="text-slate-800 font-bold text-xs">Available for Sale on POS</span>
                </label>
              </div>

              {/* Variations Builder */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <span className="font-bold text-slate-900 block">Size Variations (e.g. Regular, Large, 14")</span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={varName}
                    onChange={(e) => setVarName(e.target.value)}
                    placeholder="Variation name (e.g. Large)"
                    className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={varPriceDiff}
                    onChange={(e) => setVarPriceDiff(e.target.value)}
                    placeholder={`+Price diff (${branch.currencySymbol || 'PKR'})`}
                    className="w-28 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleAddVariation}
                    className="px-3 py-1.5 bg-[#16665A] text-white font-bold rounded-lg hover:bg-[#115448] cursor-pointer"
                  >
                    + Add Size
                  </button>
                </div>

                {variations.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {variations.map((v) => (
                      <span
                        key={v.id}
                        className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg flex items-center gap-1.5 font-medium text-slate-800"
                      >
                        <span>{v.name} (+{money(v.priceDifference)})</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveVariation(v.id)}
                          className="text-slate-400 hover:text-rose-600"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Modifiers Builder */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <span className="font-bold text-slate-900 block">Add-ons & Extras (e.g. Extra Cheese, Bacon)</span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={modName}
                    onChange={(e) => setModName(e.target.value)}
                    placeholder="Extra modifier name"
                    className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={modPrice}
                    onChange={(e) => setModPrice(e.target.value)}
                    placeholder={`Price (${branch.currencySymbol || 'PKR'})`}
                    className="w-28 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleAddModifier}
                    className="px-3 py-1.5 bg-[#16665A] text-white font-bold rounded-lg hover:bg-[#115448] cursor-pointer"
                  >
                    + Add Extra
                  </button>
                </div>

                {modifiers.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {modifiers.map((m) => (
                      <span
                        key={m.id}
                        className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg flex items-center gap-1.5 font-medium text-slate-800"
                      >
                        <span>{m.name} (+{money(m.price)})</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveModifier(m.id)}
                          className="text-slate-400 hover:text-rose-600"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E8E3DA]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-[#35514C] hover:bg-[#E8F3F0] hover:text-[#16665A] rounded-xl font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2.5 bg-[#16665A] hover:bg-[#115448] text-white font-bold rounded-xl shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? 'Saving…' : editingProduct ? 'Save Changes' : 'Create Menu Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Category Modal */}
      {isCatModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#18302D]/45 backdrop-blur-sm p-4">
          <div className="bg-[#FFFDFC] rounded-2xl shadow-[0_24px_64px_-28px_rgba(24,48,45,0.55)] max-w-sm w-full overflow-hidden border border-[#E8E3DA] p-5 space-y-4">
            <h3 className="font-extrabold text-base text-[#18302D]">Add Menu Category</h3>
            <form onSubmit={handleCreateCategory} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Category Name *</label>
                <input
                  type="text"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="e.g. Pasta, Wraps, Drinks"
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-amber-500 font-bold"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCatModalOpen(false)}
                  className="px-3.5 py-1.5 text-[#35514C] hover:bg-[#E8F3F0] hover:text-[#16665A] rounded-xl font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-[#16665A] hover:bg-[#115448] text-white font-bold rounded-xl shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? 'Saving…' : 'Create Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
