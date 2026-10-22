import React, { useEffect, useRef, useState } from 'react';
import { RestaurantTable, Floor, FloorLayout, FloorLayoutObject, FloorObjectType, Branch, User, Order, TableShape } from '../../types/restaurant';
import { sqliteService } from '../../services/sqliteStorage';
import { useAppTheme } from '../../context/ThemeContext';
import { formatCurrency } from '../../utils/currency';
import { showUserInfo } from '../../utils/userFeedback';
import {
  Users,
  Clock,
  Sparkles,
  PlusCircle,
  LayoutGrid,
  Plus,
  Edit,
  Trash2,
  X,
  CheckCircle,
  ArrowRightLeft,
  Receipt,
  UtensilsCrossed,
  Layers,
  ChevronRight,
  Maximize2,
  Circle,
  Square,
  Armchair,
  Check,
  List,
  Map,
  CircleDot,
  DoorOpen,
  Move,
  Save,
  PanelTop,
  TreePine,
  Tag,
  Grid3X3,
} from 'lucide-react';

interface TableFloorMapProps {
  branch: Branch;
  currentUser: User;
  onSelectTableForOrder: (tableId: string) => void;
}

export const TableFloorMap: React.FC<TableFloorMapProps> = ({
  branch,
  currentUser,
  onSelectTableForOrder,
}) => {
  const { styles } = useAppTheme();
  const money = (amount: number) => formatCurrency(amount, branch.currencySymbol);
  const [floors, setFloors] = useState<Floor[]>(() => sqliteService.getFloors(branch.id));
  const [selectedFloorId, setSelectedFloorId] = useState<string>(() => floors[0]?.id || 'flr-1');
  const [tables, setTables] = useState<RestaurantTable[]>(() =>
    sqliteService.getTables(branch.id)
  );
  const [activeTableOrder, setActiveTableOrder] = useState<Order | null>(null);
  const [selectedTableForDetails, setSelectedTableForDetails] = useState<RestaurantTable | null>(null);
  const [workspaceView, setWorkspaceView] = useState<'floor' | 'list'>('floor');
  const [isLayoutEditing, setIsLayoutEditing] = useState(false);
  const [layoutDraft, setLayoutDraft] = useState<FloorLayout>({ canvasWidth: 1200, canvasHeight: 760, gridSize: 20, objects: [] });
  const [dragging, setDragging] = useState<{ kind: 'table' | 'object'; id: string } | null>(null);
  const [selectedLayoutObjectId, setSelectedLayoutObjectId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Add / Edit Table Modal State
  const [isTableModalOpen, setIsTableModalOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<RestaurantTable | null>(null);
  const [tableName, setTableName] = useState('');
  const [tableCapacity, setTableCapacity] = useState('4');
  const [tableShape, setTableShape] = useState<TableShape>('square');
  const [tableFloorId, setTableFloorId] = useState(selectedFloorId);

  // Section Modal State (Add & Edit)
  const [isFloorModalOpen, setIsFloorModalOpen] = useState(false);
  const [editingFloor, setEditingFloor] = useState<Floor | null>(null);
  const [floorNameInput, setFloorNameInput] = useState('');
  const [isDeleteSectionModalOpen, setIsDeleteSectionModalOpen] = useState(false);

  // Table Deletion In-App Modal State
  const [tablePendingDelete, setTablePendingDelete] = useState<RestaurantTable | null>(null);

  // Quick Seating Modal State
  const [tableToSeat, setTableToSeat] = useState<RestaurantTable | null>(null);
  const [seatGuestCount, setSeatGuestCount] = useState('2');

  // Transfer Table Modal State
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferTargetTableId, setTransferTargetTableId] = useState('');

  const refreshTables = () => {
    const updatedFloors = sqliteService.getFloors(branch.id);
    setFloors(updatedFloors);
    setTables(sqliteService.getTables(branch.id));
    if (!updatedFloors.some((f) => f.id === selectedFloorId) && updatedFloors.length > 0) {
      setSelectedFloorId(updatedFloors[0].id);
    }
  };

  const currentFloor = floors.find((f) => f.id === selectedFloorId) || floors[0];
  const currentFloorTables = tables.filter((t) => t.floorId === selectedFloorId);
  const selectedLayoutObject = layoutDraft.objects.find((object) => object.id === selectedLayoutObjectId) || null;
  const canManageLayout = sqliteService.getUserPermissions(currentUser).canManageTables;

  const defaultTablePosition = (index: number) => ({
    x: 16 + (index % 4) * 23,
    y: 28 + Math.floor(index / 4) * 32,
  });

  useEffect(() => {
    if (!selectedTableForDetails && currentFloorTables.length > 0) {
      handleTableClick(currentFloorTables[0]);
    }
  // A floor change intentionally selects its first real table so the inspector
  // is immediately useful instead of presenting an empty decorative panel.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFloorId, currentFloorTables.length]);

  useEffect(() => {
    setLayoutDraft(currentFloor?.layout || { canvasWidth: 1200, canvasHeight: 760, gridSize: 20, objects: [] });
    setIsLayoutEditing(false);
    setSelectedLayoutObjectId(null);
  }, [selectedFloorId]);

  const getOccupancyDuration = (occupiedSince?: string) => {
    if (!occupiedSince) return null;
    const diffMs = Date.now() - new Date(occupiedSince).getTime();
    const mins = Math.max(1, Math.floor(diffMs / 60000));
    return `${mins}m`;
  };

  const handleTableClick = (table: RestaurantTable) => {
    setSelectedTableForDetails(table);
    if (table.status === 'occupied' && table.currentOrderId) {
      const orders = sqliteService.getOrders(branch.id);
      const order = orders.find((o) => o.id === table.currentOrderId);
      setActiveTableOrder(order || null);
    } else {
      setActiveTableOrder(null);
    }
  };

  const handleQuickSeatOrOrder = (table: RestaurantTable, e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectTableForOrder(table.id);
  };

  const handleOpenAddTable = () => {
    setEditingTable(null);
    setTableName(`T-0${tables.length + 1}`);
    setTableCapacity('4');
    setTableShape('square');
    setTableFloorId(selectedFloorId);
    setIsTableModalOpen(true);
  };

  const handleOpenEditTable = (table: RestaurantTable, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTable(table);
    setTableName(table.name);
    setTableCapacity(table.capacity.toString());
    setTableShape(table.shape || 'square');
    setTableFloorId(table.floorId);
    setIsTableModalOpen(true);
  };

  const handleSaveTable = async (e: React.FormEvent) => {
    e.preventDefault();
    const capacityNum = parseInt(tableCapacity) || 4;
    if (!tableName.trim()) return;
    setActionError(null); setIsSaving(true);
    try {
      const details = { name: tableName, capacity: capacityNum, shape: tableShape, floorId: tableFloorId };
      if (editingTable) await sqliteService.updateTable(editingTable.id, details, currentUser);
      else await sqliteService.addTable({ ...details, branchId: branch.id, status: 'available' }, currentUser);
      setIsTableModalOpen(false);
      refreshTables();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to save the table.');
    } finally { setIsSaving(false); }
  };

  const handleConfirmDeleteTable = async () => {
    if (!tablePendingDelete) return;
    setActionError(null); setIsSaving(true);
    try {
      await sqliteService.deleteTable(tablePendingDelete.id, currentUser);
      if (selectedTableForDetails?.id === tablePendingDelete.id) setSelectedTableForDetails(null);
      setTablePendingDelete(null);
      refreshTables();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to delete the table.');
    } finally { setIsSaving(false); }
  };

  // SECTION MANAGEMENT: Create, Edit & Delete
  const handleOpenAddSection = () => {
    setEditingFloor(null);
    setFloorNameInput('');
    setIsFloorModalOpen(true);
  };

  const handleOpenEditSection = () => {
    if (!currentFloor) return;
    setEditingFloor(currentFloor);
    setFloorNameInput(currentFloor.name);
    setIsFloorModalOpen(true);
  };

  const handleSaveSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!floorNameInput.trim()) return;
    setActionError(null); setIsSaving(true);
    try {
      if (editingFloor) await sqliteService.updateFloor(editingFloor.id, floorNameInput.trim(), currentUser);
      else {
        const flr = await sqliteService.addFloor(floorNameInput.trim(), branch.id, currentUser);
        setSelectedFloorId(flr.id);
      }
      setIsFloorModalOpen(false);
      refreshTables();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to save the floor section.');
    } finally { setIsSaving(false); }
  };

  const handleConfirmDeleteSection = async () => {
    if (floors.length <= 1 || !currentFloor) return;
    setActionError(null); setIsSaving(true);
    try {
      await sqliteService.deleteFloor(currentFloor.id, currentUser);
      setIsDeleteSectionModalOpen(false);
      refreshTables();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to delete the floor section.');
    } finally { setIsSaving(false); }
  };

  // TABLE STATUS ACTIONS
  const handleSetStatus = async (tableId: string, status: RestaurantTable['status']) => {
    setActionError(null);
    try {
      const updated = await sqliteService.setTableStatus(tableId, status, currentUser);
      refreshTables();
      if (updated && selectedTableForDetails?.id === tableId) setSelectedTableForDetails(updated);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to update table status.');
    }
  };

  // Quick Seating
  const handleOpenQuickSeat = (table: RestaurantTable, e: React.MouseEvent) => {
    e.stopPropagation();
    setTableToSeat(table);
    setSeatGuestCount(table.capacity.toString());
  };

  const handleConfirmQuickSeat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tableToSeat) return;
    const guests = parseInt(seatGuestCount) || tableToSeat.capacity;
    setActionError(null); setIsSaving(true);
    try {
      await sqliteService.updateTable(tableToSeat.id, { status: 'occupied', currentGuests: guests, occupiedSince: new Date().toISOString() }, currentUser);
      setTableToSeat(null);
      refreshTables();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to seat guests at this table.');
    } finally { setIsSaving(false); }
  };

  // TABLE TRANSFER / MOVE
  const handleOpenTransfer = (e: React.MouseEvent) => {
    e.stopPropagation();
    const vacantTables = tables.filter(
      (t) => t.status === 'available' && t.id !== selectedTableForDetails?.id
    );
    if (vacantTables.length === 0) {
      showUserInfo('There are no vacant tables available for this transfer.', 'No table available');
      return;
    }
    setTransferTargetTableId(vacantTables[0].id);
    setIsTransferModalOpen(true);
  };

  const handleConfirmTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTableForDetails || !transferTargetTableId) return;

    setActionError(null); setIsSaving(true);
    try {
      await sqliteService.transferTable(selectedTableForDetails.id, transferTargetTableId, currentUser);
      setIsTransferModalOpen(false);
      setSelectedTableForDetails(null);
      refreshTables();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to transfer this table order.');
    } finally { setIsSaving(false); }
  };

  const saveLayout = async (nextLayout: FloorLayout) => {
    if (!currentFloor) return;
    setActionError(null);
    setIsSaving(true);
    try {
      const saved = await sqliteService.updateFloorLayout(currentFloor.id, nextLayout, currentUser);
      setLayoutDraft(saved.layout || nextLayout);
      setFloors((previous) => previous.map((floor) => floor.id === saved.id ? saved : floor));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The floor layout could not be saved.');
    } finally { setIsSaving(false); }
  };

  const addLayoutObject = (type: FloorObjectType) => {
    if (!canManageLayout) return;
    const labels: Record<FloorObjectType, string> = { wall: 'Wall', door: 'Entrance', counter: 'Service counter', booth: 'Booth', plant: 'Plant', label: 'New label', zone: 'Zone' };
    const dimensions: Record<FloorObjectType, [number, number]> = { wall: [28, 2], door: [8, 4], counter: [24, 8], booth: [18, 12], plant: [6, 6], label: [16, 5], zone: [30, 22] };
    const [width, height] = dimensions[type];
    const object: FloorLayoutObject = { id: `layout-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type, label: labels[type], x: 50, y: 50, width, height, rotation: 0, zIndex: layoutDraft.objects.length + 1 };
    const nextLayout = { ...layoutDraft, objects: [...layoutDraft.objects, object] };
    setLayoutDraft(nextLayout);
    setSelectedLayoutObjectId(object.id);
    void saveLayout(nextLayout);
  };

  const updateLayoutObject = (id: string, patch: Partial<FloorLayoutObject>) => {
    const nextLayout = { ...layoutDraft, objects: layoutDraft.objects.map((object) => object.id === id ? { ...object, ...patch } : object) };
    setLayoutDraft(nextLayout);
    void saveLayout(nextLayout);
  };

  const removeLayoutObject = (id: string) => {
    const nextLayout = { ...layoutDraft, objects: layoutDraft.objects.filter((object) => object.id !== id) };
    setLayoutDraft(nextLayout);
    setSelectedLayoutObjectId(null);
    void saveLayout(nextLayout);
  };

  const canvasPosition = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!bounds) return null;
    return {
      x: Math.max(3, Math.min(97, ((event.clientX - bounds.left) / bounds.width) * 100)),
      y: Math.max(4, Math.min(96, ((event.clientY - bounds.top) / bounds.height) * 100)),
    };
  };

  const handleCanvasPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || !isLayoutEditing) return;
    const position = canvasPosition(event);
    if (!position) return;
    if (dragging.kind === 'table') {
      setTables((previous) => previous.map((table) => table.id === dragging.id ? { ...table, posX: position.x, posY: position.y } : table));
    } else {
      setLayoutDraft((previous) => ({ ...previous, objects: previous.objects.map((object) => object.id === dragging.id ? { ...object, ...position } : object) }));
    }
  };

  const handleCanvasPointerUp = () => {
    if (!dragging || !isLayoutEditing) return;
    const completed = dragging;
    setDragging(null);
    if (completed.kind === 'table') {
      const table = tables.find((entry) => entry.id === completed.id);
      if (table) void sqliteService.updateTable(table.id, { posX: table.posX, posY: table.posY }, currentUser).then(refreshTables).catch((error) => setActionError(error instanceof Error ? error.message : 'Table position could not be saved.'));
    } else {
      void saveLayout(layoutDraft);
    }
  };

  const tableStatusCount = (status: RestaurantTable['status']) =>
    currentFloorTables.filter((table) => table.status === status).length;

  const statusPresentation: Record<RestaurantTable['status'], {
    label: string;
    shortLabel: string;
    cardClass: string;
    dotClass: string;
    badgeClass: string;
  }> = {
    available: {
      label: 'Available', shortLabel: 'Available',
      cardClass: 'bg-emerald-50 border-emerald-300 text-emerald-950 hover:border-emerald-500',
      dotClass: 'bg-emerald-500', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    },
    occupied: {
      label: 'Occupied', shortLabel: 'Occupied',
      cardClass: 'bg-[var(--rf-primary)] border-[var(--rf-primary)] text-white hover:bg-[var(--rf-primary-hover)] hover:border-[var(--rf-primary-hover)]',
      dotClass: 'bg-[var(--rf-primary)]', badgeClass: 'bg-[var(--rf-green-soft)] text-[var(--rf-primary)] border-[var(--rf-primary)]/25',
    },
    reserved: {
      label: 'Reserved', shortLabel: 'Reserved',
      cardClass: 'bg-amber-50 border-amber-300 text-amber-950 hover:border-amber-500',
      dotClass: 'bg-amber-400', badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
    },
    cleaning: {
      label: 'Needs cleaning', shortLabel: 'Cleaning',
      cardClass: 'bg-rose-50 border-rose-300 text-rose-950 hover:border-rose-500',
      dotClass: 'bg-rose-400', badgeClass: 'bg-rose-100 text-rose-800 border-rose-200',
    },
    out_of_service: {
      label: 'Out of service', shortLabel: 'Offline',
      cardClass: 'bg-slate-100 border-slate-300 text-slate-700 hover:border-slate-400',
      dotClass: 'bg-slate-400', badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    },
  };

  return (
    <div className={`flex-1 flex flex-col h-full min-h-0 gap-4 overflow-y-auto p-4 md:p-5 ${styles.bgApp}`}>
      {/* Floor & Controls Bar */}
      <div className={`p-4 md:p-5 rounded-2xl ${styles.bgSurface} border ${styles.borderDefault} flex flex-wrap items-center justify-between gap-4 shadow-[0_10px_28px_-24px_rgba(24,48,45,0.45)]`}>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[var(--rf-green-soft)] border border-[var(--rf-primary)]/25 text-[var(--rf-primary)]">
            <LayoutGrid className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black tracking-tight text-slate-900">Floor &amp; Tables</h2>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Service active
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Live floor plan, table status, seating and active tickets
            </p>
          </div>
        </div>

        {/* Action Buttons: Add Table & Add Section */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleOpenAddSection}
            className="px-3 py-2 bg-white hover:bg-[var(--rf-green-soft)] text-[var(--rf-primary)] text-xs font-bold rounded-xl border border-[var(--rf-primary)]/25 transition flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add section</span>
          </button>

          <button
            type="button"
            onClick={handleOpenAddTable}
            className="px-3.5 py-2 bg-[var(--rf-primary)] hover:bg-[var(--rf-primary-hover)] text-[var(--rf-primary-text)] text-xs font-bold rounded-xl shadow-sm transition flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add table</span>
          </button>
        </div>
      </div>

      {actionError && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">
          {actionError}
        </div>
      )}

      {/* Floor Tabs Strip with Section Delete & Edit Options */}
      <div className={`px-3 py-2.5 rounded-2xl ${styles.bgSurface} border ${styles.borderDefault} flex flex-wrap items-center justify-between gap-3 shadow-[0_10px_28px_-24px_rgba(24,48,45,0.45)]`}>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
            <button type="button" onClick={() => setWorkspaceView('floor')} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${workspaceView === 'floor' ? 'bg-[var(--rf-primary)] text-[var(--rf-primary-text)] shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-900'}`}>
              <Map className="h-3.5 w-3.5" /> Floor plan
            </button>
            <button type="button" onClick={() => setWorkspaceView('list')} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${workspaceView === 'list' ? 'bg-[var(--rf-primary)] text-[var(--rf-primary-text)] shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-900'}`}>
              <List className="h-3.5 w-3.5" /> Table list
            </button>
          </div>
          <div className="flex items-center gap-1 bg-slate-200/60 p-1 rounded-xl">
            {floors.map((floor) => (
              <button
                key={floor.id}
                type="button"
                onClick={() => {
                  setSelectedFloorId(floor.id);
                  setSelectedTableForDetails(null);
                }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  selectedFloorId === floor.id
                    ? 'bg-[var(--rf-primary)] text-[var(--rf-primary-text)] shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {floor.name}
              </button>
            ))}
          </div>

          {/* Section Action Controls (Edit / Remove Section) */}
          <div className="flex items-center gap-1 border-l border-slate-300 pl-2">
            <button
              type="button"
              onClick={handleOpenEditSection}
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg text-xs transition cursor-pointer flex items-center gap-1"
              title="Rename Current Section"
            >
              <Edit className="w-3.5 h-3.5" />
              <span className="hidden sm:inline font-semibold text-[11px]">Rename floor</span>
            </button>

            {floors.length > 1 && (
              <button
                type="button"
                onClick={() => setIsDeleteSectionModalOpen(true)}
                className="p-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg text-xs transition cursor-pointer flex items-center gap-1"
                title="Remove Current Section"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline font-semibold text-[11px]">Remove floor</span>
              </button>
            )}
          </div>
        </div>

        {/* Status Legend */}
        <div className="flex items-center gap-3 text-[11px] font-semibold text-slate-600">
          {canManageLayout && workspaceView === 'floor' && (
            <button type="button" onClick={() => setIsLayoutEditing((value) => !value)} className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition ${isLayoutEditing ? 'border-[var(--rf-primary)] bg-[var(--rf-primary)] text-[var(--rf-primary-text)]' : 'border-[var(--rf-primary)]/25 bg-white text-[var(--rf-primary)] hover:bg-[var(--rf-green-soft)]'}`}>
              <Move className="h-3.5 w-3.5" /> {isLayoutEditing ? 'Finish layout' : 'Edit layout'}
            </button>
          )}
          {(['available', 'occupied', 'reserved', 'cleaning'] as const).map((status) => (
            <button key={status} type="button" onClick={() => { const table = currentFloorTables.find((item) => item.status === status); if (table) handleTableClick(table); }} className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 transition hover:bg-slate-50">
              <span className={`w-2.5 h-2.5 rounded-full ${statusPresentation[status].dotClass}`} /> {statusPresentation[status].shortLabel} <strong className="text-slate-900">{tableStatusCount(status)}</strong>
            </button>
          ))}
        </div>
      </div>

      {/* Main Floor Workspace: Tables Grid + Details Inspector */}
      <div className={`flex-1 min-h-[460px] flex overflow-hidden rounded-2xl border ${styles.borderDefault} ${styles.bgSurface} shadow-[0_10px_28px_-24px_rgba(24,48,45,0.45)]`}>
        <aside className="hidden w-56 shrink-0 border-r border-slate-100 bg-white p-4 lg:block">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900">Occupancy</h3>
            <span className="rounded-full bg-[var(--rf-green-soft)] px-2 py-1 text-[10px] font-bold text-[var(--rf-primary)]">{currentFloorTables.length} tables</span>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full border-[7px] border-[var(--rf-primary)]/25">
              <strong className="text-lg font-black text-slate-900">{tableStatusCount('occupied')}</strong>
              <span className="text-[8px] font-bold uppercase text-slate-500">busy</span>
            </div>
            <div className="space-y-1.5 text-[11px]">
              {(['occupied', 'available', 'reserved', 'cleaning'] as const).map((status) => <div key={status} className="flex items-center justify-between gap-3 text-slate-600"><span className="flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${statusPresentation[status].dotClass}`} />{statusPresentation[status].shortLabel}</span><strong className="text-slate-900">{tableStatusCount(status)}</strong></div>)}
            </div>
          </div>
          <div className="mt-6 border-t border-slate-100 pt-4">
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Floor controls</p>
            <button type="button" onClick={handleOpenAddTable} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-[var(--rf-primary)]/25 bg-white px-3 py-2 text-xs font-bold text-[var(--rf-primary)] transition hover:bg-[var(--rf-green-soft)]"><Plus className="h-3.5 w-3.5" /> Add table</button>
            <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2.5 text-[11px] leading-4 text-slate-500">Select any table on the layout to view its live ticket, seating and status actions.</p>
          </div>
        </aside>
        {/* Interactive Floor Grid */}
        <div className="flex-1 min-w-0 p-5 overflow-y-auto bg-[#FFFDFC]">
          <div className="mb-4 flex items-center justify-between">
            <div><h3 className="text-sm font-black text-slate-900">{currentFloor?.name || 'Floor plan'}</h3><p className="mt-0.5 text-[11px] text-slate-500">Select a table to inspect its live status and ticket.</p></div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-slate-600"><DoorOpen className="h-3.5 w-3.5 text-[var(--rf-primary)]" /> Live layout</span>
          </div>
          {currentFloorTables.length === 0 ? (
            <div className="p-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
              <LayoutGrid className="w-12 h-12 stroke-1 text-slate-300 mx-auto mb-2" />
              <h4 className="font-bold text-slate-700 text-sm">No tables in this section</h4>
              <p className="text-xs text-slate-400 mt-1">
                Click "Add New Table" to create a table in {currentFloor?.name || 'this room'}.
              </p>
              <button
                type="button"
                onClick={handleOpenAddTable}
                className="mt-4 px-4 py-2 bg-[#16665A] hover:bg-[#115448] text-white text-xs font-bold rounded-xl transition cursor-pointer"
              >
                + Add Table Now
              </button>
            </div>
          ) : workspaceView === 'list' ? (
            <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white">
              <table className="w-full min-w-[620px] text-left text-xs">
                <thead className="border-b border-slate-100 bg-slate-50 text-[10px] font-black uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Table</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Guests</th><th className="px-4 py-3">Seated</th><th className="px-4 py-3 text-right">Action</th></tr></thead>
                <tbody>{currentFloorTables.map((table) => <tr key={table.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50"><td className="px-4 py-3 font-black text-slate-900">{table.name}<span className="ml-2 font-normal text-slate-400">{table.shape || 'square'}</span></td><td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold ${statusPresentation[table.status].badgeClass}`}>{statusPresentation[table.status].label}</span></td><td className="px-4 py-3 text-slate-600">{table.currentGuests || 0} / {table.capacity}</td><td className="px-4 py-3 text-slate-600">{table.status === 'occupied' ? getOccupancyDuration(table.occupiedSince) || 'Active' : '—'}</td><td className="px-4 py-3 text-right"><button type="button" onClick={() => handleTableClick(table)} className="rounded-lg border border-[var(--rf-primary)]/25 bg-white px-2.5 py-1.5 font-bold text-[var(--rf-primary)] transition hover:bg-[var(--rf-green-soft)]">Inspect</button></td></tr>)}</tbody>
              </table>
            </div>
          ) : (
            <div ref={canvasRef} onPointerMove={handleCanvasPointerMove} onPointerUp={handleCanvasPointerUp} onPointerCancel={handleCanvasPointerUp} className="relative min-h-[560px] overflow-hidden rounded-2xl border border-[#E8E3DA] bg-[#F1ECE2] p-7" style={{ backgroundImage: 'radial-gradient(color-mix(in srgb, var(--rf-primary) 15%, transparent) 1px, transparent 1px)', backgroundSize: `${Math.max(10, layoutDraft.gridSize)}px ${Math.max(10, layoutDraft.gridSize)}px` }}>
              <div className="absolute inset-x-7 top-7 z-10 flex items-center justify-between rounded-xl border border-[#CBBEAA] bg-[#E6DCCB] px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.15em] text-[#665A4B]">
                <span className="inline-flex items-center gap-2"><DoorOpen className="h-3.5 w-3.5 text-[var(--rf-primary)]" /> Entrance &amp; welcome</span>
                <span className="hidden sm:inline">Service aisle</span>
                <span className="inline-flex items-center gap-2">Kitchen pass <UtensilsCrossed className="h-3.5 w-3.5 text-[var(--rf-primary)]" /></span>
              </div>
              {isLayoutEditing && (
                <div className="absolute left-7 top-20 z-30 flex max-w-[calc(100%-3.5rem)] flex-wrap items-center gap-1.5 rounded-xl border border-[var(--rf-primary)]/25 bg-white/95 p-2 shadow-lg backdrop-blur">
                  <span className="px-1.5 text-[10px] font-black uppercase tracking-wide text-slate-500">Add object</span>
                  {([
                    ['wall', PanelTop, 'Wall'], ['door', DoorOpen, 'Door'], ['counter', Receipt, 'Counter'], ['booth', Armchair, 'Booth'], ['plant', TreePine, 'Plant'], ['label', Tag, 'Label'], ['zone', Grid3X3, 'Zone'],
                  ] as Array<[FloorObjectType, typeof PanelTop, string]>).map(([type, Icon, label]) => <button key={type} type="button" onClick={() => addLayoutObject(type)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-bold text-slate-600 transition hover:bg-[var(--rf-green-soft)] hover:text-[var(--rf-primary)]"><Icon className="h-3 w-3" /> {label}</button>)}
                  <span className="ml-auto inline-flex items-center gap-1 px-1.5 text-[10px] font-semibold text-slate-500"><Save className="h-3 w-3 text-[var(--rf-primary)]" /> Auto-saves on drop</span>
                </div>
              )}
              {isLayoutEditing && selectedLayoutObject && (
                <div className="absolute bottom-5 right-5 z-30 w-52 rounded-xl border border-[var(--rf-primary)]/25 bg-white/95 p-3 shadow-lg backdrop-blur">
                  <div className="flex items-center justify-between gap-2"><div><p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Selected object</p><p className="text-xs font-black text-slate-800">{selectedLayoutObject.label || selectedLayoutObject.type}</p></div><button type="button" onClick={() => removeLayoutObject(selectedLayoutObject.id)} className="rounded-lg bg-rose-50 p-1.5 text-rose-700 hover:bg-rose-100" title="Remove object"><Trash2 className="h-3.5 w-3.5" /></button></div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] font-bold text-slate-600">
                    <label>Width<input type="number" min="1" max="100" value={Math.round(selectedLayoutObject.width)} onChange={(event) => updateLayoutObject(selectedLayoutObject.id, { width: Number(event.target.value) || 1 })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-800" /></label>
                    <label>Height<input type="number" min="1" max="100" value={Math.round(selectedLayoutObject.height)} onChange={(event) => updateLayoutObject(selectedLayoutObject.id, { height: Number(event.target.value) || 1 })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-800" /></label>
                    <label className="col-span-2">Rotation<input type="range" min="-180" max="180" value={selectedLayoutObject.rotation || 0} onChange={(event) => updateLayoutObject(selectedLayoutObject.id, { rotation: Number(event.target.value) })} className="mt-1 w-full accent-[var(--rf-primary)]" /></label>
                  </div>
                  <p className="mt-2 text-[10px] leading-4 text-slate-500">Drag to move. Update size or rotation here. Changes save locally.</p>
                </div>
              )}
              {layoutDraft.objects.map((object) => {
                const visualClass = object.type === 'wall' ? 'bg-[#7C6D5C] rounded-sm' : object.type === 'door' ? 'rounded-md border-2 border-[#9A7B4E] bg-[#E8D4B0]' : object.type === 'counter' ? 'rounded-xl border border-[#9B8060] bg-[#C9B093] shadow-sm' : object.type === 'booth' ? 'rounded-2xl border-4 border-[#9B8060] bg-[#DCC8AD]' : object.type === 'plant' ? 'rounded-full border-4 border-[#769469] bg-[#C7DDC0]' : object.type === 'zone' ? 'rounded-2xl border-2 border-dashed border-[var(--rf-primary)]/35 bg-[var(--rf-green-soft)]/45' : 'rounded-md border border-slate-300 bg-white/90';
                return <div key={object.id} onPointerDown={(event) => { if (!isLayoutEditing) return; event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); setSelectedLayoutObjectId(object.id); setDragging({ kind: 'object', id: object.id }); }} onDoubleClick={() => { if (isLayoutEditing) removeLayoutObject(object.id); }} title={isLayoutEditing ? 'Drag to move. Double-click to remove.' : undefined} className={`absolute flex select-none items-center justify-center px-1 text-center text-[10px] font-black uppercase tracking-wide text-[#4D453B] ${visualClass} ${isLayoutEditing ? `cursor-move ring-2 ${selectedLayoutObjectId === object.id ? 'ring-[var(--rf-primary)]' : 'ring-transparent hover:ring-[var(--rf-primary)]/55'}` : 'pointer-events-none'}`} style={{ left: `${object.x}%`, top: `${object.y}%`, width: `${object.width}%`, height: `${object.height}%`, zIndex: object.zIndex || 1, transform: `translate(-50%, -50%) rotate(${object.rotation || 0}deg)`, backgroundColor: object.color || undefined }}>{object.label}</div>;
              })}
              {currentFloorTables.map((table, index) => {
                const duration = getOccupancyDuration(table.occupiedSince);
                const isOccupied = table.status === 'occupied';
                const isSelected = selectedTableForDetails?.id === table.id;
                const isHighlighted = isOccupied && isSelected;
                const shape = table.shape || 'square';

                // Shape styling
                const shapeBorderRadius =
                  shape === 'round'
                    ? 'rounded-full aspect-square'
                    : shape === 'booth'
                    ? 'rounded-2xl border-x-8'
                    : shape === 'rectangle'
                    ? 'rounded-2xl col-span-1 sm:col-span-2'
                    : 'rounded-xl aspect-square';

                let statusColors = 'bg-emerald-50/70 border-emerald-300 hover:border-emerald-500 text-emerald-950';
                if (table.status === 'occupied') {
                  statusColors = isHighlighted
                    ? 'bg-[var(--rf-primary)] border-[var(--rf-primary)] hover:bg-[var(--rf-primary-hover)] hover:border-[var(--rf-primary-hover)] text-white ring-2 ring-[var(--rf-primary)]/20'
                    : 'bg-[var(--rf-green-soft)] border-[var(--rf-primary)]/35 text-[var(--rf-primary)] hover:border-[var(--rf-primary)]';
                } else if (table.status === 'reserved') {
                  statusColors = 'bg-amber-50/70 border-amber-300 hover:border-amber-500 text-amber-950';
                } else if (table.status === 'cleaning') {
                  statusColors = 'bg-rose-50/70 border-rose-300 hover:border-rose-500 text-rose-950';
                }

                return (
                  <div
                    key={table.id}
                    onClick={() => handleTableClick(table)}
                    onPointerDown={(event) => { if (!isLayoutEditing) return; event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); setDragging({ kind: 'table', id: table.id }); }}
                    className={`group absolute p-3 border-2 flex flex-col justify-between cursor-pointer transition hover:scale-[1.02] shadow-sm select-none min-h-[112px] ${shapeBorderRadius} ${statusColors} ${
                  isSelected ? 'ring-4 ring-[var(--rf-primary)]/20 border-[var(--rf-primary)] shadow-md' : ''
                    } ${isLayoutEditing ? 'cursor-move' : ''}`}
                    style={{ left: `${table.posX ?? defaultTablePosition(index).x}%`, top: `${table.posY ?? defaultTablePosition(index).y}%`, width: shape === 'rectangle' || shape === 'booth' ? '25%' : '17%', height: shape === 'rectangle' || shape === 'booth' ? '17%' : '19%', transform: 'translate(-50%, -50%)', zIndex: 20 }}
                  >
                    {/* Chair indicator pills around table shape */}
                    <div className="absolute -top-1.5 inset-x-0 flex justify-center gap-1 pointer-events-none">
                      {Array.from({ length: Math.min(4, Math.ceil(table.capacity / 2)) }).map((_, i) => (
                        <span key={i} className={`w-3.5 h-1.5 rounded-full shadow-2xs ${isHighlighted ? 'bg-slate-700/45' : 'bg-[#9B8A72]/60'}`} />
                      ))}
                    </div>
                    <div className="absolute -bottom-1.5 inset-x-0 flex justify-center gap-1 pointer-events-none">
                      {Array.from({ length: Math.min(4, Math.floor(table.capacity / 2)) }).map((_, i) => (
                        <span key={i} className={`w-3.5 h-1.5 rounded-full shadow-2xs ${isHighlighted ? 'bg-slate-700/45' : 'bg-[#9B8A72]/60'}`} />
                      ))}
                    </div>

                    {/* Top Bar with Name & Quick Edit */}
                    <div className="flex items-start justify-between w-full">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h3 className={`text-xl font-black font-mono tracking-tight ${isHighlighted ? 'text-white' : 'text-slate-900'}`}>
                            {table.name}
                          </h3>
                          {shape === 'round' && <span className="text-[10px] text-slate-400">⚪</span>}
                          {shape === 'booth' && <span className="text-[10px] text-slate-400">🛋️</span>}
                        </div>
                        <span className={`text-[11px] font-semibold flex items-center gap-1 mt-0.5 ${isHighlighted ? 'text-white/80' : 'text-slate-500'}`}>
                          <Users className="w-3 h-3" />
                          <span>{table.capacity} seats ({shape})</span>
                        </span>
                      </div>

                      {/* Edit Table Button */}
                      <button
                        type="button"
                        onClick={(e) => handleOpenEditTable(table, e)}
                        className={`opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-black/5 transition cursor-pointer ${isHighlighted ? 'text-white/70 hover:text-white' : 'text-slate-400 hover:text-slate-800'}`}
                        title="Edit Table Layout"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Middle Info / Center Graphic */}
                    <div className="my-auto py-2 flex flex-col items-center justify-center text-center">
                      {isOccupied ? (
                        <div className="space-y-1">
                          <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1 mx-auto w-fit ${isHighlighted ? 'text-white bg-white/15 border border-white/20' : 'text-[var(--rf-primary)] bg-white/75 border border-[var(--rf-primary)]/15'}`}>
                            <Clock className="w-3 h-3" />
                            {duration || 'Active'}
                          </span>
                          <span className={`text-[11px] font-bold block ${isHighlighted ? 'text-white/90' : 'text-[var(--rf-primary)]'}`}>
                            {table.currentGuests || table.capacity} Guests Seated
                          </span>
                        </div>
                      ) : table.status === 'reserved' ? (
                        <span className="font-bold text-xs text-amber-800 bg-amber-100 px-2.5 py-1 rounded-full border border-amber-200">
                          Reserved Guest
                        </span>
                      ) : table.status === 'cleaning' ? (
                        <span className="font-bold text-xs text-rose-700 bg-rose-100 px-2.5 py-1 rounded-full border border-rose-200">
                          Needs Wipe / Bus
                        </span>
                      ) : (
                        <span className="font-bold text-xs text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full border border-emerald-200">
                          Vacant Table
                        </span>
                      )}
                    </div>

                    {/* Bottom Quick Action Bar */}
                    <div className={`hidden items-center justify-between w-full pt-2 border-t gap-1 ${isHighlighted ? 'border-white/15 text-white/80' : 'border-black/5'}`}>
                      <span className="text-[10px] font-mono uppercase font-bold tracking-wider">
                        {table.status}
                      </span>

                      <div className="flex items-center gap-1">
                        {table.status === 'available' ? (
                          <>
                            <button
                              type="button"
                              onClick={(e) => handleOpenQuickSeat(table, e)}
                              className="px-2 py-1 bg-[var(--rf-primary)] hover:bg-[var(--rf-primary-hover)] text-[var(--rf-primary-text)] rounded-lg text-[10px] font-bold flex items-center gap-0.5 shadow-2xs transition cursor-pointer"
                              title="Seat Walk-in Guests"
                            >
                              <Users className="w-3 h-3" />
                              <span>Seat</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleQuickSeatOrOrder(table, e)}
                              className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[10px] font-bold flex items-center gap-0.5 shadow-2xs transition cursor-pointer"
                              title="Ring up order in POS"
                            >
                              <UtensilsCrossed className="w-3 h-3" />
                              <span>Order</span>
                            </button>
                          </>
                        ) : table.status === 'occupied' ? (
                          <button
                            type="button"
                            onClick={(e) => handleQuickSeatOrOrder(table, e)}
                            className="px-2 py-1 bg-white hover:bg-white/90 text-[var(--rf-primary)] rounded-lg text-[10px] font-bold flex items-center gap-0.5 shadow-2xs transition cursor-pointer"
                            title="Add items to ticket in POS"
                          >
                            <UtensilsCrossed className="w-3 h-3" />
                            <span>Add Order</span>
                          </button>
                        ) : table.status === 'cleaning' ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSetStatus(table.id, 'available');
                            }}
                            className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[10px] font-bold flex items-center gap-0.5 shadow-2xs transition cursor-pointer"
                          >
                            <CheckCircle className="w-3 h-3" />
                            <span>Ready</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSetStatus(table.id, 'occupied');
                            }}
                            className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg text-[10px] font-bold flex items-center gap-0.5 shadow-2xs transition cursor-pointer"
                          >
                            <span>Seat</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Interactive Table Inspector Drawer */}
        {selectedTableForDetails && (
          <aside className="w-80 border-l border-slate-100 bg-white p-5 flex flex-col justify-between overflow-y-auto shadow-[0_8px_24px_-18px_rgba(24,48,45,0.32)]">
            <div className="space-y-4">
              <div className="flex items-start justify-between pb-3 border-b border-[#E8E3DA]">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-black font-mono text-slate-900">
                      Table {selectedTableForDetails.name}
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        selectedTableForDetails.status === 'occupied'
                          ? 'bg-[var(--rf-green-soft)] text-[var(--rf-primary)] border border-[var(--rf-primary)]/25'
                          : selectedTableForDetails.status === 'available'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      {selectedTableForDetails.status}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500">
                    Section: <strong>{currentFloor?.name}</strong> • {selectedTableForDetails.capacity} seats ({selectedTableForDetails.shape || 'square'})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTableForDetails(null)}
                  className="p-1.5 text-slate-400 hover:text-[var(--rf-primary)] rounded-lg hover:bg-[var(--rf-green-soft)] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Status Switcher Radio Buttons */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Table Status Control</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      { id: 'available', label: '🟢 Available' },
                      { id: 'occupied', label: '🟡 Occupied' },
                      { id: 'reserved', label: '🔵 Reserved' },
                      { id: 'cleaning', label: '🟣 Cleaning' },
                    ] as const
                  ).map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => handleSetStatus(selectedTableForDetails.id, st.id)}
                      className={`px-2 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                        selectedTableForDetails.status === st.id
                          ? 'bg-[var(--rf-primary)] text-[var(--rf-primary-text)] border-[var(--rf-primary)] shadow-sm font-bold'
                          : 'bg-white hover:bg-[var(--rf-green-soft)] border-slate-200 text-slate-600 hover:text-[var(--rf-primary)]'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Active Ticket Order Details (if occupied) */}
              {activeTableOrder ? (
                <div className="p-3 bg-[#F7F3EC] border border-[#E8E3DA] rounded-xl space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-mono font-bold text-slate-900">
                      Ticket #{activeTableOrder.invoiceNumber.split('-').pop()}
                    </span>
                    <span className="font-mono font-bold text-[var(--rf-primary)]">
                      {money(activeTableOrder.grandTotal)}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Server: {activeTableOrder.cashierName} • Seated {getOccupancyDuration(selectedTableForDetails.occupiedSince)}
                  </div>

                  <div className="pt-2 border-t border-slate-200 space-y-1 max-h-36 overflow-y-auto">
                    {activeTableOrder.items.map((item) => (
                      <div key={item.id} className="flex justify-between text-[11px] text-slate-700">
                        <span>
                          <strong>{item.quantity}x</strong> {item.productName}
                        </span>
                        <span className="font-mono text-slate-500">{money(item.totalPrice)}</span>
                      </div>
                    ))}
                  </div>

                  {/* Transfer Table Button */}
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleOpenTransfer}
                      className="w-full py-1.5 px-3 bg-white hover:bg-[#E8F3F0] text-[#35514C] hover:text-[#16665A] font-bold text-xs rounded-lg border border-[#B9D8D0] transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5 text-slate-600" />
                      <span>Transfer Order to Another Table</span>
                    </button>
                  </div>
                </div>
              ) : selectedTableForDetails.status === 'occupied' ? (
                <div className="p-3 bg-[#E8F3F0] border border-[#B9D8D0] rounded-xl text-xs text-[#35514C]">
                  Table is marked occupied without an active POS ticket.
                </div>
              ) : null}

              {/* Action Buttons */}
              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={() => onSelectTableForOrder(selectedTableForDetails.id)}
                  className="w-full py-2.5 px-4 bg-[var(--rf-primary)] hover:bg-[var(--rf-primary-hover)] text-[var(--rf-primary-text)] font-black text-xs rounded-xl shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <UtensilsCrossed className="w-4 h-4" />
                  <span>
                    {selectedTableForDetails.status === 'occupied' ? 'Open Ticket in POS' : 'Take Order / Seat Guests'}
                  </span>
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={(e) => handleOpenEditTable(selectedTableForDetails, e)}
                    className="flex-1 py-2 px-3 bg-white hover:bg-[var(--rf-green-soft)] text-slate-600 hover:text-[var(--rf-primary)] font-bold text-xs rounded-xl border border-[var(--rf-primary)]/25 transition flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    <span>Edit Table</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTablePendingDelete(selectedTableForDetails)}
                    className="py-2 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl border border-rose-200 transition flex items-center justify-center gap-1 cursor-pointer"
                    title="Delete Table"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-[#E8E3DA] text-[10px] text-[#97A6A1] text-center font-mono">
              RestoFlow Floor Manager • Local State
            </div>
          </aside>
        )}
        {!selectedTableForDetails && (
          <aside className="w-80 border-l border-slate-100 bg-white p-5 flex flex-col items-center justify-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--rf-green-soft)] text-[var(--rf-primary)]"><UtensilsCrossed className="h-5 w-5" /></div>
            <h3 className="mt-4 text-sm font-black text-slate-800">Select a table</h3>
            <p className="mt-1 max-w-52 text-xs leading-5 text-slate-500">Choose a table from the floor plan to view live seating, its ticket and available actions.</p>
          </aside>
        )}
      </div>

      {/* Add / Edit Table Modal */}
      {isTableModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-2xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-in fade-in duration-200">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-900">
                {editingTable ? 'Edit Table Configuration' : 'Add New Dining Table'}
              </h3>
              <button
                type="button"
                onClick={() => setIsTableModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTable} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Table Name / Number *</label>
                <input
                  type="text"
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  placeholder="e.g. T-05 or VIP-1"
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-bold text-sm"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Seating Capacity (Guests)</label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={tableCapacity}
                  onChange={(e) => setTableCapacity(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono font-bold"
                />
              </div>

              {/* Table Shape Selector */}
              <div>
                <label className="block font-medium text-slate-700 mb-1.5">Table Architectural Shape</label>
                <div className="grid grid-cols-4 gap-2">
                  {(
                    [
                      { id: 'square', label: 'Square', icon: Square },
                      { id: 'round', label: 'Round', icon: Circle },
                      { id: 'rectangle', label: 'Rectangle', icon: Maximize2 },
                      { id: 'booth', label: 'Booth', icon: Armchair },
                    ] as const
                  ).map((sh) => {
                    const Icon = sh.icon;
                    const isSel = tableShape === sh.id;
                    return (
                      <button
                        key={sh.id}
                        type="button"
                        onClick={() => setTableShape(sh.id)}
                        className={`p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 transition cursor-pointer ${
                          isSel
                            ? 'bg-amber-500 text-slate-950 border-amber-600 font-bold shadow-2xs'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="text-[10px]">{sh.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Dining Floor / Section</label>
                <select
                  value={tableFloorId}
                  onChange={(e) => setTableFloorId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-800"
                >
                  {floors.map((flr) => (
                    <option key={flr.id} value={flr.id}>
                      {flr.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsTableModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 hover:bg-slate-100 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl shadow-xs transition cursor-pointer"
                >
                  {editingTable ? 'Save Changes' : 'Create Table'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit Section Modal */}
      {isFloorModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-2xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden border border-slate-200">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-900">
                {editingFloor ? 'Rename Section' : 'Add New Room / Section'}
              </h3>
              <button
                type="button"
                onClick={() => setIsFloorModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSection} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Section Name *</label>
                <input
                  type="text"
                  value={floorNameInput}
                  onChange={(e) => setFloorNameInput(e.target.value)}
                  placeholder="e.g. Rooftop Terrace or VIP Lounge"
                  required
                  autoFocus
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-bold text-sm"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsFloorModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 hover:bg-slate-100 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl shadow-xs transition cursor-pointer"
                >
                  {editingFloor ? 'Update Section' : 'Create Section'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transfer Table Modal */}
      {isTransferModalOpen && selectedTableForDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-2xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden border border-slate-200">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-900">Transfer Table Order</h3>
              <button
                type="button"
                onClick={() => setIsTransferModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmTransfer} className="p-6 space-y-4 text-xs">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-slate-800">
                Moving order from <strong>Table {selectedTableForDetails.name}</strong> to:
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Select Vacant Target Table *</label>
                <select
                  value={transferTargetTableId}
                  onChange={(e) => setTransferTargetTableId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-bold"
                >
                  {tables
                    .filter((t) => t.status === 'available')
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.capacity} seats - {t.shape || 'square'})
                      </option>
                    ))}
                </select>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsTransferModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 hover:bg-slate-100 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl shadow-xs transition cursor-pointer"
                >
                  Confirm Transfer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* IN-APP CONFIRM REMOVE SECTION MODAL */}
      {isDeleteSectionModalOpen && currentFloor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 text-center border border-slate-200">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-3">
              <Trash2 className="w-6 h-6 stroke-2" />
            </div>
            <h3 className="font-bold text-base text-slate-900">
              Remove Section "{currentFloor.name}"?
            </h3>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              All <strong>{currentFloorTables.length} tables</strong> currently assigned to this room will be safely migrated to the main floor section.
            </p>

            <div className="mt-5 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setIsDeleteSectionModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteSection}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition shadow-xs cursor-pointer"
              >
                Yes, Remove Section
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IN-APP CONFIRM DELETE TABLE MODAL */}
      {tablePendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 text-center border border-slate-200">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-3">
              <Trash2 className="w-6 h-6 stroke-2" />
            </div>
            <h3 className="font-bold text-base text-slate-900">
              Delete Table {tablePendingDelete.name}?
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Are you sure you want to remove this table ({tablePendingDelete.capacity} seats) from the seating layout?
            </p>

            <div className="mt-5 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setTablePendingDelete(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteTable}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition shadow-xs cursor-pointer"
              >
                Yes, Delete Table
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QUICK SEAT GUESTS MODAL */}
      {tableToSeat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden border border-slate-200">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-amber-500" />
                <h3 className="font-bold text-sm">Seat Guests at Table {tableToSeat.name}</h3>
              </div>
              <button
                type="button"
                onClick={() => setTableToSeat(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmQuickSeat} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-2">Number of Seated Guests</label>
                <div className="flex items-center gap-2 mb-2">
                  {[1, 2, 4, 6, 8].map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setSeatGuestCount(count.toString())}
                      className={`px-3 py-2 rounded-xl text-xs font-bold font-mono transition cursor-pointer flex-1 text-center ${
                        seatGuestCount === count.toString()
                          ? 'bg-amber-500 text-slate-950 shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      {count}p
                    </button>
                  ))}
                </div>

                <input
                  type="number"
                  min="1"
                  max="50"
                  value={seatGuestCount}
                  onChange={(e) => setSeatGuestCount(e.target.value)}
                  placeholder="Custom headcount..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-bold text-sm focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setTableToSeat(null)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 hover:bg-slate-100 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl shadow-xs transition cursor-pointer"
                >
                  Confirm Seating
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
