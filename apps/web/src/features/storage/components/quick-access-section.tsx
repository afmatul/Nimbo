'use client';

import type { QuickAccessItem, QuickAccessList } from '@nimbo/contracts';
import { ChevronRight, Clock, EllipsisVertical, Folder, Pin, PinOff } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { FileTypeIcon } from '../../../components/nimbo/file-type-chip';
import { useSidebarSlot, type SidebarSlot } from '../../../components/nimbo/sidebar-slot';
import { Button } from '../../../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import { cn } from '../../../lib/utils';
import { CHIP_TYPE_BY_KIND } from '../file-type';
import type { QuickAccess } from '../hooks/use-quick-access';
import { folderPath, MY_FILES_LABEL, MY_FILES_PATH } from '../routes';

export interface QuickAccessSectionProps {
  readonly quickAccess: QuickAccess;
  /** Un archivo se descarga al activarlo, como «Descargar» de 005 (y cuenta como reciente). */
  readonly onOpenFile: (item: QuickAccessItem) => void;
}

/** Lo que cada elemento necesita de la sección. */
interface ItemContext {
  readonly slot: SidebarSlot;
  readonly onOpenFile: (item: QuickAccessItem) => void;
}

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const ITEM_CLASS = `flex w-full min-w-0 items-center gap-2.5 rounded-md px-3 text-left font-medium text-secondary-foreground transition-colors hover:bg-muted hover:text-foreground ${FOCUS_RING}`;
const ITEM_SIZE = { desktop: 'min-h-8 py-1 text-sm', drawer: 'min-h-11 py-2 text-base' } as const;
const TITLE_CLASS =
  'flex items-center gap-1.5 px-3 pt-2 text-xs font-semibold text-muted-foreground';
/** Atributo de los elementos fijados, para mover el foco al quitar uno. */
const PINNED_LINK = 'data-pinned-link';

/**
 * «Accesos rápidos» (006 CA-27, mockup `shared/layout`): grupos «Fijados» y «Recientes» con lo que dice el servidor (5
 * y 3 de inicio), enlaces sin desglose, «Ver más» a Mis archivos si hay más recientes y ⋮ en cada fijado. Sin nada que
 * mostrar (o mientras carga) no se dibuja; si falla, un aviso discreto con «Reintentar».
 */
export function QuickAccessSection({
  quickAccess,
  onOpenFile,
}: QuickAccessSectionProps): React.JSX.Element {
  const { state } = quickAccess;
  const containerRef = React.useRef<HTMLDivElement>(null);
  const removal = useFocusAfterRemoval(
    containerRef,
    state.status === 'ready' ? state.list.pinned : undefined,
  );
  const context: ItemContext = { slot: useSidebarSlot(), onOpenFile };
  return (
    <div ref={containerRef}>
      {state.status === 'error' ? <LoadError onRetry={quickAccess.reload} /> : null}
      {state.status === 'ready' ? (
        <>
          <QuickAccessGroups
            list={state.list}
            context={context}
            onUnpin={(item, index) => void removal.unpin(quickAccess, item, index)}
          />
          {/* Sigue aunque se quite el último elemento y la sección se oculte, para anunciarlo. */}
          <p role="status" className="sr-only">
            {removal.announcement}
          </p>
        </>
      ) : null}
    </div>
  );
}

interface PendingFocus {
  readonly index: number;
  /** Si no queda ningún fijado ni reciente: el primer enlace de la barra. */
  readonly fallback: HTMLElement | null;
}

function focusNear(container: HTMLElement | null, pending: PendingFocus): void {
  const links = container?.querySelectorAll<HTMLElement>(`[${PINNED_LINK}]`) ?? [];
  const nearest = links[Math.min(pending.index, links.length - 1)];
  const firstOfSection = container?.querySelector<HTMLElement>('a, button');
  (nearest ?? firstOfSection ?? pending.fallback)?.focus();
}

/**
 * Al quitar un fijado: el foco pasa al siguiente (o al anterior) y un `status` lo anuncia (mockup `fijado-menu-abierto`).
 * Si falla, el foco se queda y el aviso lo muestra la página arriba de la lista (`onNotice`).
 */
function useFocusAfterRemoval(
  containerRef: React.RefObject<HTMLDivElement | null>,
  pinned: readonly QuickAccessItem[] | undefined,
) {
  const pending = React.useRef<PendingFocus | null>(null);
  const [announcement, setAnnouncement] = React.useState('');

  React.useEffect(() => {
    if (pending.current === null) return;
    focusNear(containerRef.current, pending.current);
    pending.current = null;
  }, [containerRef, pinned]);

  const unpin = async (quickAccess: QuickAccess, item: QuickAccessItem, index: number) => {
    const fallback = containerRef.current?.closest('nav')?.querySelector<HTMLElement>('a') ?? null;
    pending.current = { index, fallback };
    const removed = await quickAccess.unpin(item);
    if (!removed) {
      pending.current = null;
      return;
    }
    setAnnouncement(`${item.name} ya no está en la barra lateral`);
  };

  return { announcement, unpin };
}

function LoadError({ onRetry }: { readonly onRetry: () => void }): React.JSX.Element {
  return (
    <div className="mt-4 px-3 text-xs text-secondary-foreground">
      <p>No pudimos cargar tus accesos rápidos.</p>
      <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={onRetry}>
        Reintentar<span className="sr-only"> accesos rápidos</span>
      </Button>
    </div>
  );
}

function QuickAccessGroups({
  list,
  context,
  onUnpin,
}: {
  readonly list: QuickAccessList;
  readonly context: ItemContext;
  readonly onUnpin: (item: QuickAccessItem, index: number) => void;
}): React.JSX.Element | null {
  const titleId = React.useId();
  if (list.pinned.length === 0 && list.recent.length === 0) return null;
  return (
    <div className="mt-4 space-y-0.5">
      <p
        id={titleId}
        className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        Accesos rápidos
      </p>
      <ItemGroup
        titleId={titleId}
        label="Fijados"
        icon={Pin}
        items={list.pinned}
        context={context}
        onUnpin={onUnpin}
      />
      <ItemGroup
        titleId={titleId}
        label="Recientes"
        icon={Clock}
        items={list.recent}
        context={context}
      />
      {list.hasMoreRecent ? <SeeMoreLink slot={context.slot} /> : null}
    </div>
  );
}

interface ItemGroupProps {
  readonly titleId: string;
  readonly label: 'Fijados' | 'Recientes';
  readonly icon: typeof Pin;
  readonly items: readonly QuickAccessItem[];
  readonly context: ItemContext;
  /** Solo los fijados tienen ⋮. */
  readonly onUnpin?: (item: QuickAccessItem, index: number) => void;
}

function ItemGroup({ titleId, label, icon: Icon, items, context, onUnpin }: ItemGroupProps) {
  const groupId = React.useId();
  if (items.length === 0) return null;
  return (
    <>
      <p id={groupId} className={TITLE_CLASS}>
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </p>
      <ul className="grid grid-cols-1 gap-0.5" aria-labelledby={`${titleId} ${groupId}`}>
        {items.map((item, index) => (
          <li key={`${item.type}-${item.id}`} className="group relative">
            <ItemLink item={item} context={context} pinned={onUnpin !== undefined} />
            {onUnpin ? (
              <PinnedItemMenu
                item={item}
                inDrawer={context.slot.inDrawer}
                onRemove={() => onUnpin(item, index)}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}

/** Nombre en una línea: si no cabe se corta con «…» y la extensión queda visible (mockup `con-ver-mas`). */
function ItemName({ item }: { readonly item: QuickAccessItem }): React.JSX.Element {
  const dot = item.type === 'file' ? item.name.lastIndexOf('.') : -1;
  const [stem, extension] =
    dot > 0 ? [item.name.slice(0, dot), item.name.slice(dot)] : [item.name, ''];
  return (
    <span className="flex min-w-0 flex-1 whitespace-nowrap">
      <span className="truncate">{stem}</span>
      {extension ? <span className="shrink-0">{extension}</span> : null}
    </span>
  );
}

function ItemIcon({ item }: { readonly item: QuickAccessItem }): React.JSX.Element {
  if (item.type === 'folder')
    return <Folder className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />;
  return (
    <FileTypeIcon
      fileType={CHIP_TYPE_BY_KIND[item.kind ?? 'otro']}
      className="shrink-0 text-secondary-foreground"
    />
  );
}

/** Nombre accesible: el visible y qué pasa al activarlo (mockup `shared/layout`). */
const accessibleNameOf = (item: QuickAccessItem): string =>
  `${item.name}, ${item.type === 'folder' ? 'carpeta' : 'archivo, se descarga'}`;

/** Carpeta: enlace a su página. Archivo: se descarga al activarlo (no tiene página), por eso es un botón. */
function ItemLink({
  item,
  context,
  pinned,
}: {
  readonly item: QuickAccessItem;
  readonly context: ItemContext;
  readonly pinned: boolean;
}): React.JSX.Element {
  const { slot, onOpenFile } = context;
  const shared = {
    title: item.name,
    'aria-label': accessibleNameOf(item),
    className: cn(
      ITEM_CLASS,
      slot.inDrawer ? ITEM_SIZE.drawer : ITEM_SIZE.desktop,
      pinned && (slot.inDrawer ? 'pr-12' : 'pr-9'),
    ),
    ...(pinned ? { [PINNED_LINK]: '' } : {}),
  };
  const content = [<ItemIcon key="icono" item={item} />, <ItemName key="nombre" item={item} />];
  if (item.type === 'folder') {
    return (
      <Link href={folderPath(item.id)} {...shared}>
        {content}
      </Link>
    );
  }
  const open = (): void => {
    onOpenFile(item);
    slot.onNavigate();
  };
  return (
    <button type="button" onClick={open} {...shared}>
      {content}
    </button>
  );
}

function SeeMoreLink({ slot }: { readonly slot: SidebarSlot }): React.JSX.Element {
  return (
    <Link
      href={MY_FILES_PATH}
      className={cn(
        'flex items-center gap-1 rounded-md px-3 font-semibold text-primary hover:bg-muted hover:text-primary-hover',
        FOCUS_RING,
        slot.inDrawer ? ITEM_SIZE.drawer : ITEM_SIZE.desktop,
      )}
    >
      <span>
        Ver más<span className="sr-only">{` en ${MY_FILES_LABEL}`}</span>
      </span>
      <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
    </Link>
  );
}

const TRIGGER_CLASS = `absolute flex items-center justify-center rounded-md text-secondary-foreground hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground ${FOCUS_RING}`;
/** En escritorio aparece con el puntero, el foco o el menú abierto; sin puntero (`hover: none`) y en el cajón, siempre. */
const TRIGGER_PLACEMENT = {
  desktop:
    'right-0.5 top-1/2 h-7 w-7 -translate-y-1/2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 data-[state=open]:opacity-100 hover-none:opacity-100',
  drawer: 'right-0 top-0 h-11 w-11',
} as const;

/** ⋮ de un fijado (patrón «menu button»): un solo ítem, «Quitar de la barra lateral». */
function PinnedItemMenu({
  item,
  inDrawer,
  onRemove,
}: {
  readonly item: QuickAccessItem;
  readonly inDrawer: boolean;
  readonly onRemove: () => void;
}): React.JSX.Element {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Acciones de ${item.name}`}
          className={cn(
            TRIGGER_CLASS,
            inDrawer ? TRIGGER_PLACEMENT.drawer : TRIGGER_PLACEMENT.desktop,
          )}
        >
          <EllipsisVertical className="h-4 w-4" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      {/* Escape cierra solo el menú: no llega al cajón móvil, que también escucha Escape. */}
      <DropdownMenuContent
        align="start"
        className="min-w-52"
        onEscapeKeyDown={(event) => event.stopPropagation()}
      >
        <DropdownMenuItem onSelect={onRemove}>
          <PinOff className="h-4 w-4 text-secondary-foreground" aria-hidden="true" />
          Quitar de la barra lateral
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
