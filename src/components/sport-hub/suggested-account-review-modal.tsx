'use client';

import React, { useState, useEffect } from 'react';
import {
  Users,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Edit3,
  Link2,
  FileText,
  MapPin,
  Flame,
  ArrowRight,
} from 'lucide-react';
import { ScoutDialogFrame, scoutButtonClass, scoutInputClass } from './scout-dialog-frame';
import { PlatformIcon } from './platform-icon';
import { t, formatNumber } from '@/lib/i18n';
import { scoutFetch } from '@/lib/apify/scout-client';
import type { SuggestedPostAccount } from '@/lib/apify/post-contracts';

export interface SuggestedAccountReviewModalProps {
  suggestion: SuggestedPostAccount;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function SuggestedAccountReviewModal({
  suggestion,
  isOpen,
  onClose,
  onSuccess,
}: SuggestedAccountReviewModalProps) {
  // Step: 1 = Select CRM destination, 2 = Review Candidate Details & Confirm, 3 = Imported & Success
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: Destination & Parameters
  const [entityType, setEntityType] = useState<'kol' | 'community'>('kol');
  const [geography, setGeography] = useState('Toàn quốc');
  const [keyword, setKeyword] = useState('');

  // Step 2: Session & Candidate Data from saved-evidence preview
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<any>(null);

  // Manual edits state
  const [editName, setEditName] = useState(suggestion.name || '');
  const [editBio, setEditBio] = useState('');
  const [editGeography, setEditGeography] = useState('Toàn quốc');
  const [savingEdits, setSavingEdits] = useState(false);
  const [editSaved, setEditSaved] = useState(false);

  // Explicit confirmation checks
  const [confirmType, setConfirmType] = useState(false);
  const [confirmRelevance, setConfirmRelevance] = useState(false);
  const [confirmLocation, setConfirmLocation] = useState(false);

  // Review & Import actions
  const [approving, setApproving] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importedAccount, setImportedAccount] = useState<{ entityType: 'kol' | 'community'; id: string } | null>(null);

  // Post link retry state
  const [linkingBusy, setLinkingBusy] = useState(false);
  const [linkResult, setLinkResult] = useState<{ linked: number; conflicts: string[] } | null>(null);
  const [linkError, setLinkError] = useState('');

  // Step 1 -> 2: Create Saved Evidence Preview
  const handleCreatePreview = async () => {
    setLoadingPreview(true);
    setPreviewError('');

    try {
      const res = await scoutFetch('/api/sport-hub/scout/suggested-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identity: suggestion.identity,
          entityType,
          keyword: keyword.trim() || undefined,
          geography: geography.trim() || 'Any location',
          name: editName.trim() || suggestion.name,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        if (data.code === 'SUGGESTION_STALE') {
          throw new Error('This suggestion is no longer available. The account may have already been imported.');
        }
        if (data.code === 'POST_WORKSPACE_SCHEMA_UNAVAILABLE') {
          throw new Error('Posts workspaces require the database migration. No collection was started.');
        }
        throw new Error(data.error || 'Failed to create suggestion preview.');
      }

      setSessionId(data.sessionId);
      const cand = data.candidates?.[0];
      if (cand) {
        setCandidate(cand);
        setEditName(cand.name || suggestion.name);
        setEditBio(cand.bio || '');
        setEditGeography(cand.verifiedGeography || geography || 'Toàn quốc');
      }
      setStep(2);
    } catch (err: any) {
      setPreviewError(err.message || 'Error generating preview.');
    } finally {
      setLoadingPreview(false);
    }
  };

  // Save manual edits via PATCH
  const handleSaveEdits = async () => {
    if (!sessionId || !candidate) return;
    setSavingEdits(true);
    setPreviewError('');

    try {
      const res = await scoutFetch('/api/sport-hub/scout/suggested-accounts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          candidateId: candidate.candidateId,
          name: editName.trim() || candidate.name,
          bio: editBio,
          geography: editGeography.trim() || candidate.verifiedGeography,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        if (data.code === 'REVIEW_STALE') {
          throw new Error('The review session was updated. Retaining edits.');
        }
        throw new Error(data.error || 'Failed to save candidate details.');
      }

      setCandidate(data.candidate);
      setIsApproved(false); // Edits invalidate prior approval
      setEditSaved(true);
      setTimeout(() => setEditSaved(false), 3000);
    } catch (err: any) {
      setPreviewError(err.message || 'Error updating details.');
    } finally {
      setSavingEdits(false);
    }
  };

  // Step 2: Approve Candidate
  const handleApprove = async () => {
    if (!sessionId || !candidate) return;
    setApproving(true);
    setPreviewError('');

    try {
      const res = await scoutFetch('/api/sport-hub/scout/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          candidateId: candidate.candidateId,
          decision: 'approved',
          typeConfirmed: true,
          entityType: entityType === 'kol' ? 'Individual' : 'Community',
          relevant: true,
          locationConfirmed: true,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to approve account.');
      }

      setIsApproved(true);
    } catch (err: any) {
      setPreviewError(err.message || 'Error saving review approval.');
    } finally {
      setApproving(false);
    }
  };

  // Step 2: Import Candidate into Database CRM
  const handleImport = async () => {
    if (!sessionId || !candidate || !isApproved) return;
    setImporting(true);
    setPreviewError('');

    try {
      const res = await scoutFetch('/api/sport-hub/scout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm',
          sessionId,
          selected: [
            {
              candidateId: candidate.candidateId,
              classification: entityType === 'kol' ? 'Individual' : 'Community',
              relevant: true,
              locationConfirmed: true,
            },
          ],
          targetType: entityType === 'kol' ? 'Individual KOLs' : 'Communities & Clubs',
          geography: editGeography || candidate.verifiedGeography || 'Toàn quốc',
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to import account into database.');
      }

      // Record imported account ID if returned
      const importedId =
        data.importedIds?.[0] || data.recordId || data.insertedRecord?.id || data.records?.[0]?.id;
      if (importedId) {
        setImportedAccount({ entityType, id: importedId });
      }

      setStep(3);
      window.dispatchEvent(new CustomEvent('sport-hub-data-changed'));
      onSuccess();
    } catch (err: any) {
      setPreviewError(err.message || 'Error importing candidate.');
    } finally {
      setImporting(false);
    }
  };

  // Independent Retry Post Linking
  const handleRetryLinking = async () => {
    if (!importedAccount) return;
    setLinkingBusy(true);
    setLinkError('');

    try {
      const res = await scoutFetch('/api/sport-hub/scout/post-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityType: importedAccount.entityType,
          id: importedAccount.id,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to link posts to imported account.');
      }

      setLinkResult({ linked: data.linked || 0, conflicts: data.conflicts || [] });
      window.dispatchEvent(new CustomEvent('sport-hub-data-changed'));
      onSuccess();
    } catch (err: any) {
      setLinkError(err.message || 'Retry linking failed.');
    } finally {
      setLinkingBusy(false);
    }
  };

  if (!isOpen) return null;

  return (
    <ScoutDialogFrame
      title={
        step === 1
          ? 'Review Suggested Account'
          : step === 2
          ? 'Confirm & Import Account'
          : 'Account Successfully Imported'
      }
      description={
        step === 1
          ? `Select the CRM destination for "${suggestion.name}". Opening uses saved post evidence without launching paid providers.`
          : step === 2
          ? 'Review details, edit metadata, and explicitly confirm account type and relevance before import.'
          : 'The creator has been imported with status "New Scout (Unverified)" and linked to their saved posts.'
      }
      onClose={onClose}
    >
      {/* ─── STEP 1: SELECT DESTINATION ─── */}
      {step === 1 && (
        <div className="space-y-5">
          {previewError && (
            <div role="alert" className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="font-semibold">{previewError}</p>
            </div>
          )}

          {/* Account Overview Header */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <PlatformIcon platform={suggestion.platform} size="sm" />
                <span className="text-sm font-bold text-slate-900">{suggestion.name}</span>
              </div>
              <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                {suggestion.postCount} saved post(s)
              </span>
            </div>

            <div className="flex items-center space-x-1.5 text-xs text-slate-600">
              <ExternalLink className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <a
                href={suggestion.profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 hover:underline truncate"
              >
                {suggestion.profileUrl}
              </a>
            </div>
          </div>

          {/* Destination Selection */}
          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
              Choose CRM Destination
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setEntityType('kol')}
                className={`p-3.5 rounded-xl border text-left transition cursor-pointer ${
                  entityType === 'kol'
                    ? 'border-indigo-600 bg-indigo-50/30 ring-2 ring-indigo-500/20'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0">
                    <Users className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">KOLs & Creators</span>
                    <span className="text-[10px] text-slate-500 block">Individual athlete or creator</span>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setEntityType('community')}
                className={`p-3.5 rounded-xl border text-left transition cursor-pointer ${
                  entityType === 'community'
                    ? 'border-indigo-600 bg-indigo-50/30 ring-2 ring-indigo-500/20'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0">
                    <ShieldCheck className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">Communities & Clubs</span>
                    <span className="text-[10px] text-slate-500 block">Club, group, or page</span>
                  </div>
                </div>
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              The user chooses the destination directory; authors are not auto-classified.
            </p>
          </div>

          {/* Region / Geography Input */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Primary Location / Region
            </label>
            <input
              type="text"
              value={geography}
              onChange={e => setGeography(e.target.value)}
              placeholder="e.g. Toàn quốc, Hà Nội, TP. Hồ Chí Minh"
              className={scoutInputClass}
            />
          </div>

          {/* Action Footer */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={loadingPreview}
              onClick={handleCreatePreview}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-bold rounded-xl shadow-xs flex items-center space-x-2 transition cursor-pointer disabled:opacity-50"
            >
              {loadingPreview ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Loading Candidate Preview...</span>
                </>
              ) : (
                <>
                  <span>Review Candidate Details</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ─── STEP 2: REVIEW CANDIDATE EVIDENCE, EDIT & APPROVE ─── */}
      {step === 2 && candidate && (
        <div className="space-y-5">
          {previewError && (
            <div role="alert" className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="font-semibold leading-relaxed">{previewError}</p>
            </div>
          )}

          {editSaved && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Details saved successfully. Prior approval has been reset for re-confirmation.</span>
            </div>
          )}

          {/* Saved Evidence Notice */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 flex items-start space-x-2">
            <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              Candidate constructed from <strong>{suggestion.postCount} saved post(s)</strong>.
              No automated provider queries were executed.
            </p>
          </div>

          {/* Candidate Form Fields */}
          <div className="space-y-3 bg-white p-4 rounded-xl border border-slate-200">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center justify-between">
              <span>Account Details (Editable)</span>
              {savingEdits && (
                <span className="text-[11px] text-indigo-600 flex items-center space-x-1 font-normal">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span>Saving edits...</span>
                </span>
              )}
            </h4>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Account / Creator Name
              </label>
              <input
                type="text"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onBlur={handleSaveEdits}
                className={scoutInputClass}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Bio / Description
              </label>
              <textarea
                rows={2}
                value={editBio}
                onChange={e => setEditBio(e.target.value)}
                onBlur={handleSaveEdits}
                placeholder="Optional creator bio or club description..."
                className={scoutInputClass}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Verified Geography
              </label>
              <input
                type="text"
                value={editGeography}
                onChange={e => setEditGeography(e.target.value)}
                onBlur={handleSaveEdits}
                className={scoutInputClass}
              />
            </div>

            <div className="pt-2 text-[11px] text-slate-500 flex items-center justify-between">
              <span>Profile URL: {suggestion.profileUrl}</span>
              <a
                href={suggestion.profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 hover:underline flex items-center space-x-1 font-semibold"
              >
                <span>Visit Profile</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Explicit Human Confirmations */}
          <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2 text-xs">
            <span className="font-bold text-amber-900 block">
              Required Human Verifications before Approval:
            </span>

            <label className="flex items-center space-x-2 text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmType}
                onChange={e => setConfirmType(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
              />
              <span>
                Confirm destination account type:{' '}
                <strong>{entityType === 'kol' ? 'Individual Creator' : 'Community / Club'}</strong>
              </span>
            </label>

            <label className="flex items-center space-x-2 text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmRelevance}
                onChange={e => setConfirmRelevance(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
              />
              <span>Confirm content and topic relevance</span>
            </label>

            <label className="flex items-center space-x-2 text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmLocation}
                onChange={e => setConfirmLocation(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
              />
              <span>Confirm verified location / market target</span>
            </label>
          </div>

          {/* Action Footer */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
            <button
              type="button"
              disabled={importing || approving}
              onClick={() => setStep(1)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition cursor-pointer"
            >
              Back
            </button>

            <div className="flex items-center space-x-2">
              {!isApproved ? (
                <button
                  type="button"
                  disabled={!confirmType || !confirmRelevance || !confirmLocation || approving}
                  onClick={handleApprove}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs font-bold rounded-xl shadow-xs flex items-center space-x-2 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {approving ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving Approval...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Approve Account</span>
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={importing}
                  onClick={handleImport}
                  className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 text-white text-xs font-bold rounded-xl shadow-xs flex items-center space-x-2 transition cursor-pointer disabled:opacity-50"
                >
                  {importing ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Importing into CRM...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Import to CRM as New Scout (Unverified)</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── STEP 3: IMPORT SUCCESS & LINKING ACTIONS ─── */}
      {step === 3 && (
        <div className="space-y-5 text-center py-4">
          <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-xs">
            <CheckCircle2 className="w-6 h-6" />
          </div>

          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-900">
              Account Imported Successfully!
            </h3>
            <p className="text-xs text-slate-600 max-w-sm mx-auto">
              <strong>{editName}</strong> has been imported as a{' '}
              {entityType === 'kol' ? 'Creator' : 'Community'} with initial status{' '}
              <strong>New Scout (Unverified)</strong>.
            </p>
          </div>

          {/* Link status & Retry Button */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-left space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800">Post Linkage Status</span>
              {linkResult ? (
                <span className="text-emerald-700 font-bold">
                  {linkResult.linked} posts linked
                </span>
              ) : (
                <span className="text-slate-500 font-medium">Automatic link run</span>
              )}
            </div>

            {linkError && (
              <p className="text-rose-700 font-semibold text-[11px]">{linkError}</p>
            )}

            {linkResult?.conflicts?.length ? (
              <p className="text-amber-700 text-[11px]">
                {linkResult.conflicts.length} post(s) had link conflicts.
              </p>
            ) : null}

            {importedAccount && (
              <button
                type="button"
                disabled={linkingBusy}
                onClick={handleRetryLinking}
                className="mt-1 text-indigo-600 hover:text-indigo-800 font-bold underline flex items-center space-x-1 cursor-pointer"
              >
                {linkingBusy ? (
                  <>
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>Retrying post linking...</span>
                  </>
                ) : (
                  <>
                    <Link2 className="w-3 h-3" />
                    <span>Retry Linking (Zero Cost)</span>
                  </>
                )}
              </button>
            )}
          </div>

          <div className="pt-2 flex items-center justify-center space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
            >
              Done & Close
            </button>
          </div>
        </div>
      )}
    </ScoutDialogFrame>
  );
}

