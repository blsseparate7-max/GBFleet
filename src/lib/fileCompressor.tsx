import React, { useState } from 'react';
import { Eye, FileText, X } from 'lucide-react';

/**
 * Compresses an image client-side to keep base64 strings tiny (~20kb-60kb),
 * preventing Firestore document size limits (1MB per document) from being breached.
 * PDFs are read directly as standard base64 strings.
 */
export function compressAndSetFile(file: File, callback: (base64: string) => void) {
  if (file.type === "application/pdf") {
    const reader = new FileReader();
    reader.onloadend = () => {
      callback(reader.result as string);
    };
    reader.readAsDataURL(file);
    return;
  }
  
  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const MAX_WIDTH = 600;
      const MAX_HEIGHT = 600;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        // Convert to high-compression JPEG to save massive space
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        callback(dataUrl);
      } else {
        callback(event.target?.result as string);
      }
    };
    img.src = event.target?.result as string;
  };
  reader.readAsDataURL(file);
}

interface AttachmentPreviewProps {
  src: string;
  label?: string;
  className?: string;
}

/**
 * A highly immersive Full Screen Lightbox & PDF Viewer component.
 * Allows seamless, sandbox-safe file viewing of custom receipts inside the platform preview.
 */
export function AttachmentPreview({ src, label, className }: AttachmentPreviewProps) {
  const [isOpen, setIsOpen] = useState(false);
  if (!src) return null;

  const isPdf = src.startsWith('data:application/pdf');

  return (
    <>
      <div className={`relative group rounded-xl overflow-hidden border border-slate-200 bg-slate-100 aspect-video flex flex-col items-center justify-center p-2 ${className || ''}`}>
        {isPdf ? (
          <div className="flex flex-col items-center justify-center text-slate-500 gap-1 w-full h-full">
            <FileText size={28} className="text-rose-500" />
            <span className="text-[10px] font-bold text-slate-600 truncate max-w-full">
              {label || "Ver Comprovante PDF"}
            </span>
          </div>
        ) : (
          <img src={src} alt={label || "Anexo"} className="object-cover w-full h-full" referrerPolicy="no-referrer" />
        )}
        <div 
          className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer gap-1.5"
          onClick={() => setIsOpen(true)}
        >
          <Eye size={14} className="text-white" />
          <span className="text-white text-[10px] font-bold uppercase tracking-wider">Visualizar</span>
        </div>
      </div>

      {isOpen && (
        <div className="fixed inset-0 bg-slate-900/75 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl overflow-hidden shadow-2xl max-w-4xl w-full h-[85vh] flex flex-col">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">{label || "Visualizar Comprovante"}</span>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-1.5 px-3 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border border-rose-100"
              >
                <X size={14} />
                Fechar
              </button>
            </div>
            <div className="flex-1 bg-slate-100 p-4 flex items-center justify-center overflow-auto">
              {isPdf ? (
                <iframe src={src} className="w-full h-full rounded-2xl border border-slate-200 bg-white" title="PDF Viewer" />
              ) : (
                <img src={src} alt="Comprovante ampliado" className="max-w-full max-h-full object-contain rounded-2xl" referrerPolicy="no-referrer" />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
