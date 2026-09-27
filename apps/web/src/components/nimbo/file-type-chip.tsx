import {
  FileText,
  FileSpreadsheet,
  Presentation,
  FileType,
  Image as ImageIcon,
  File,
} from 'lucide-react';
import * as React from 'react';

import { cn } from '../../lib/utils';

export type FileType = 'docx' | 'xlsx' | 'pptx' | 'pdf' | 'img' | 'other';

export interface FileTypeConfig {
  readonly label: string;
  readonly textColorVar: string;
  readonly bgColorVar: string;
  readonly icon: React.ComponentType<{ className?: string }>;
}

const FILE_TYPE_MAP: Record<FileType, FileTypeConfig> = {
  docx: {
    label: 'DOCX',
    textColorVar: 'var(--file-docx)',
    bgColorVar: 'var(--file-docx-bg)',
    icon: FileText,
  },
  xlsx: {
    label: 'XLSX',
    textColorVar: 'var(--file-xlsx)',
    bgColorVar: 'var(--file-xlsx-bg)',
    icon: FileSpreadsheet,
  },
  pptx: {
    label: 'PPTX',
    textColorVar: 'var(--file-pptx)',
    bgColorVar: 'var(--file-pptx-bg)',
    icon: Presentation,
  },
  pdf: {
    label: 'PDF',
    textColorVar: 'var(--file-pdf)',
    bgColorVar: 'var(--file-pdf-bg)',
    icon: FileType,
  },
  img: {
    label: 'IMG',
    textColorVar: 'var(--file-img)',
    bgColorVar: 'var(--file-img-bg)',
    icon: ImageIcon,
  },
  other: {
    label: 'OTRO',
    textColorVar: 'var(--file-other)',
    bgColorVar: 'var(--file-other-bg)',
    icon: File,
  },
};

/**
 * Obtiene el tipo de archivo clasificado a partir de un nombre o extensión.
 */
export function getFileTypeFromExtension(filenameOrExt: string): FileType {
  const ext = filenameOrExt.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'docx':
    case 'doc':
      return 'docx';
    case 'xlsx':
    case 'xls':
    case 'csv':
      return 'xlsx';
    case 'pptx':
    case 'ppt':
      return 'pptx';
    case 'pdf':
      return 'pdf';
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'webp':
    case 'svg':
      return 'img';
    default:
      return 'other';
  }
}

export interface FileTypeChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  readonly extension?: string;
  readonly filename?: string;
  readonly fileType?: FileType;
  readonly showIcon?: boolean;
}

/**
 * Chip para mostrar tipos de archivo en listas y fichas de Nimbo.
 * Cumple con contraste AA (DF-44) usando texto oscuro y fondo al 12%.
 */
export function FileTypeChip({
  extension,
  filename,
  fileType,
  showIcon = true,
  className,
  ...props
}: FileTypeChipProps): React.JSX.Element {
  const determinedType: FileType =
    fileType ??
    (extension
      ? getFileTypeFromExtension(extension)
      : filename
        ? getFileTypeFromExtension(filename)
        : 'other');

  const config = FILE_TYPE_MAP[determinedType];
  const Icon = config.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-xs font-semibold tracking-wider transition-colors',
        className,
      )}
      style={{
        color: config.textColorVar,
        backgroundColor: config.bgColorVar,
      }}
      {...props}
    >
      {showIcon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
      <span>{config.label}</span>
    </span>
  );
}
