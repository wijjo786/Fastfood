import React, { useState } from 'react';
import { Product, ProductVariation, ProductModifier, OrderItemModifier } from '../../types/restaurant';
import { X, Plus, Minus, Check } from 'lucide-react';

interface ProductCustomizationModalProps {
  product: Product;
  currencySymbol: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (
    product: Product,
    variation: ProductVariation | undefined,
    selectedModifiers: OrderItemModifier[],
    itemNotes: string,
    quantity: number
  ) => void;
}

export const ProductCustomizationModal: React.FC<ProductCustomizationModalProps> = ({
  product,
  currencySymbol,
  isOpen,
  onClose,
  onConfirm,
}) => {
  const [selectedVariation, setSelectedVariation] = useState<ProductVariation | undefined>(
    product.variations[0]
  );
  const [selectedModifiers, setSelectedModifiers] = useState<OrderItemModifier[]>([]);
  const [itemNotes, setItemNotes] = useState('');
  const [quantity, setQuantity] = useState(1);

  if (!isOpen) return null;

  const toggleModifier = (mod: ProductModifier) => {
    const exists = selectedModifiers.find((m) => m.modifierId === mod.id);
    if (exists) {
      setSelectedModifiers(selectedModifiers.filter((m) => m.modifierId !== mod.id));
    } else {
      setSelectedModifiers([
        ...selectedModifiers,
        { modifierId: mod.id, name: mod.name, price: mod.price },
      ]);
    }
  };

  const currentUnitPrice =
    product.basePrice +
    (selectedVariation ? selectedVariation.priceDifference : 0) +
    selectedModifiers.reduce((acc, m) => acc + m.price, 0);

  const totalPrice = currentUnitPrice * quantity;
  const money = (amount: number) => `${currencySymbol || 'PKR'} ${amount.toFixed(2)}`;

  const handleAdd = () => {
    onConfirm(product, selectedVariation, selectedModifiers, itemNotes, quantity);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#18302D]/45 backdrop-blur-sm p-4">
      <div className="bg-[#FFFDFC] border border-[#E8E3DA] rounded-2xl shadow-[0_24px_64px_-28px_rgba(24,48,45,0.55)] max-w-md w-full overflow-hidden text-[#18302D] flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="relative h-36 w-full overflow-hidden bg-[#E8F3F0]">
          {/^(?:restoflow-media:|data:image\/)/i.test(product.imageUrl) ? <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" /> : <div className="relative h-full w-full overflow-hidden bg-[linear-gradient(135deg,#DDF0EB_0%,#F7F3EC_52%,#C9E4DC_100%)]"><span className="absolute -right-7 -top-10 h-32 w-32 rounded-full bg-white/60" /><span className="absolute -bottom-12 -left-6 h-28 w-28 rounded-full bg-[#16665A]/10" /><span className="absolute inset-0 flex items-center justify-center text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#16665A]">Menu item</span></div>}
          <div className="absolute inset-0 bg-gradient-to-t from-[#18302D]/95 via-[#18302D]/45 to-transparent" />
          <button
            onClick={onClose}
            className="absolute top-3 right-3 bg-white/95 text-[#18302D] p-1.5 rounded-full hover:bg-[#E8F3F0] shadow-sm transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="absolute bottom-3 left-4 right-4">
            <span className="text-[10px] uppercase font-mono tracking-wider px-2 py-0.5 bg-[#46B39E] text-[#18302D] rounded font-black">
              {product.sku}
            </span>
            <h3 className="text-lg font-bold text-white mt-1 leading-tight">{product.name}</h3>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* Variations (Sizes / Crusts / Portions) */}
          {product.variations.length > 0 && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#516863] mb-2">
                Select Size / Variation
              </label>
              <div className="grid grid-cols-2 gap-2">
                {product.variations.map((v) => {
                  const isSelected = selectedVariation?.id === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedVariation(v)}
                      className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition cursor-pointer ${
                        isSelected
                          ? 'bg-[#E8F3F0] border-[#16665A] text-[#18302D] ring-2 ring-[#16665A]/15'
                          : 'bg-white border-[#E8E3DA] text-[#35514C] hover:border-[#8FC8BB] hover:bg-[#F7F3EC]'
                      }`}
                    >
                      <span className="text-xs font-bold">{v.name}</span>
                      <span className="text-xs font-mono font-semibold text-[#16665A]">
                        {v.priceDifference > 0 ? `+${money(v.priceDifference)}` : 'Base'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Add-ons / Modifiers */}
          {product.modifiers.length > 0 && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#516863] mb-2">
                Add-ons & Extras
              </label>
              <div className="space-y-1.5">
                {product.modifiers.map((mod) => {
                  const isChecked = selectedModifiers.some((m) => m.modifierId === mod.id);
                  return (
                    <button
                      key={mod.id}
                      type="button"
                      onClick={() => toggleModifier(mod)}
                      className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition cursor-pointer ${
                        isChecked
                          ? 'bg-[#E8F3F0] border-[#16665A] text-[#18302D]'
                          : 'bg-white border-[#E8E3DA] text-[#35514C] hover:border-[#8FC8BB] hover:bg-[#F7F3EC]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-4 h-4 rounded flex items-center justify-center border ${
                            isChecked
                              ? 'bg-[#16665A] border-[#16665A] text-white'
                              : 'border-[#B9D8D0] bg-white'
                          }`}
                        >
                          {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <span className="text-xs font-semibold">{mod.name}</span>
                      </div>
                      <span className="text-xs font-mono font-bold text-[#16665A]">
                        +{money(mod.price)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Special Preparation Instructions */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#516863] mb-1.5">
              Kitchen Notes / Special Requests
            </label>
            <input
              type="text"
              value={itemNotes}
              onChange={(e) => setItemNotes(e.target.value)}
              placeholder="e.g. Extra spicy, dressing on side, no pickles"
              className="w-full px-3 py-2 text-xs bg-white border border-[#D8D1C6] rounded-xl text-[#18302D] placeholder:text-[#97A6A1] focus:outline-none focus:border-[#16665A]"
            />
          </div>

          {/* Quantity Selector */}
          <div className="flex items-center justify-between pt-2 border-t border-[#F0ECE5]">
            <span className="text-xs font-bold uppercase tracking-wider text-[#516863]">
              Quantity
            </span>
            <div className="flex items-center gap-3 bg-[#F2F5F3] border border-[#DCE8E3] rounded-xl p-1">
              <button
                type="button"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="w-8 h-8 rounded-lg bg-white text-[#35514C] hover:bg-[#E8F3F0] hover:text-[#16665A] flex items-center justify-center transition shadow-sm cursor-pointer"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="w-6 text-center font-bold text-sm text-[#18302D]">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity(quantity + 1)}
                className="w-8 h-8 rounded-lg bg-white text-[#35514C] hover:bg-[#E8F3F0] hover:text-[#16665A] flex items-center justify-center transition shadow-sm cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#FFFDFC] border-t border-[#E8E3DA] flex items-center justify-between">
          <div>
            <span className="text-[11px] text-[#71807C] block">Total price</span>
            <span className="text-xl font-black text-[#16665A] font-mono">
              {money(totalPrice)}
            </span>
          </div>
          <button
            onClick={handleAdd}
            className="px-5 py-2.5 bg-[#16665A] hover:bg-[#115448] text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center gap-2 cursor-pointer"
          >
            <span>Add to Order</span>
          </button>
        </div>
      </div>
    </div>
  );
};
