import React, { useState, useEffect } from "react";
import { X, FileText, Calendar, User } from "@phosphor-icons/react";
import Document from "@/models/document";
import ModalWrapper from "@/components/ModalWrapper";

export default function DocumentViewer({ 
  isOpen, 
  onClose, 
  workspaceSlug, 
  docId,
  documentTitle = "Document" 
}) {
  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen && workspaceSlug && docId) {
      fetchDocument();
    }
  }, [isOpen, workspaceSlug, docId]);

  const fetchDocument = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await Document.viewContent(workspaceSlug, docId);
      
      if (response.success) {
        setDocument(response.document);
      } else {
        setError(response.message || "Failed to load document");
      }
    } catch (err) {
      setError("Failed to load document");
      console.error("Document fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setDocument(null);
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <ModalWrapper isOpen={isOpen}>
      <div className="w-full max-w-4xl bg-theme-bg-secondary rounded-lg shadow border-2 border-theme-modal-border overflow-hidden max-h-[80vh] flex flex-col">
        
        {/* Header */}
        <div className="relative p-6 border-b border-theme-modal-border bg-theme-bg-secondary">
          <div className="flex items-center gap-3">
            <FileText size={24} className="text-theme-text-primary flex-shrink-0" />
            <h2 className="text-xl font-semibold text-theme-text-primary truncate">
              {document?.title || documentTitle}
            </h2>
          </div>
          
          {document && (
            <div className="flex items-center gap-4 mt-3 text-sm text-theme-text-secondary">
              {document.metadata?.docAuthor && (
                <div className="flex items-center gap-1">
                  <User size={14} />
                  <span>{document.metadata.docAuthor}</span>
                </div>
              )}
              {document.metadata?.published && (
                <div className="flex items-center gap-1">
                  <Calendar size={14} />
                  <span>{document.metadata.published}</span>
                </div>
              )}
              {document.metadata?.wordCount && (
                <span>{document.metadata.wordCount} words</span>
              )}
            </div>
          )}
          
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 p-2 rounded-lg text-theme-text-secondary hover:text-theme-text-primary hover:bg-theme-modal-border transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="text-theme-text-secondary">Loading document...</div>
            </div>
          )}
          
          {error && (
            <div className="flex items-center justify-center py-12">
              <div className="text-red-400 text-center">
                <FileText size={48} className="mx-auto mb-4 opacity-50" />
                <p>{error}</p>
              </div>
            </div>
          )}
          
          {document && !loading && !error && (
            <div className="space-y-4">
              {document.metadata?.description && (
                <div className="p-4 bg-theme-bg-primary rounded-lg border border-theme-modal-border">
                  <h3 className="text-sm font-medium text-theme-text-secondary mb-2">Description</h3>
                  <p className="text-theme-text-primary">{document.metadata.description}</p>
                </div>
              )}
              
              <div className="prose prose-invert max-w-none">
                <div className="text-theme-text-primary whitespace-pre-wrap leading-relaxed">
                  {document.content}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </ModalWrapper>
  );
}
