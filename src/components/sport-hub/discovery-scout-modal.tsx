"use client";
import { approvalBlockers } from '@/lib/apify/approval-readiness';
import { hasDiscoveryLead } from '@/lib/scout-experimental/retrieval-admission';
import { ExperimentalScoutFields,emptyExperimental,type ExperimentalInputs } from './experimental-scout-fields';
import { AccountSizeFields,savedSizeCriteria } from './account-size-fields';
import type {AccountSizeCriteria} from '@/lib/apify/account-criteria';
import { ENTITY_TYPES, legacyClassification, selectedEntityTypes, type EntityType } from '@/lib/apify/account-evidence';
import { ScoutSearchPlan, useSearchPlan } from "./scout-search-plan";
import { scoutFetch } from "@/lib/apify/scout-client";

import React, { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  Sparkles,
  Compass,
  Users,
  ShieldCheck,
  X,
  RefreshCw,
  Search,
  Info,
  CheckCircle2,
  ExternalLink,
  ArrowLeft,
  UserPlus,
  UserCheck,
  CheckSquare,
  Square,
  AlertCircle,
  Eye,
  Heart,
  MessageSquare,
  Check,
  AlertTriangle,
  SlidersHorizontal,
} from "lucide-react";
import { t, formatNumber } from "@/lib/i18n";

import { ScoutDialogFrame } from "./scout-dialog-frame";
import { useScoutCapabilities } from "./use-scout-capabilities";
import { SCOUT_PLATFORMS } from "@/lib/apify/scout-workspace";
import type { ProfileReviewDecision } from "@/lib/apify/profile-review";
import type { DiscoveryCandidate } from "@/lib/apify/scout";

export type CandidateClassification = "Individual" | "Community" | "Brand/Business" | "Unknown";

export interface CandidateEditValues {
  classification: CandidateClassification;
  relevant: boolean | undefined;
  locationConfirmed: boolean | undefined;
}

export interface DiscoveryScoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (result?: any) => void;
  resumeSessionId?: string;
  initialCriteria?: Record<string, any>;
  source?: string;
  keepResultOpen?: boolean;
  onScoutSuccess?: () => void;
  defaultTargetType?: "Individual KOLs" | "Communities & Clubs" | "Sports KOLs & Influencers";
}

const PRESET_TOPICS = [
  "Pickleball Vietnam",
  "Marathon Runner HCMC",
  "Hanoi Badminton Club",
  "Tennis Coach Vietnam",
  "Fitness & Gym Creator",
  "Cycling Saigon Club",
];

export function DiscoveryScoutModal({
  isOpen,
  onClose,
  onSuccess,
  onScoutSuccess,
  defaultTargetType = "Individual KOLs",
  resumeSessionId, initialCriteria, source, keepResultOpen,
}: DiscoveryScoutModalProps) {
  // Step state: 1 = Search Configuration & Preview, 2 = Candidate Review & Confirmation
  const [step, setStep] = useState<1 | 2>(1);

  // Form Inputs
  const initialType: "Individual KOLs" | "Communities & Clubs" =
    defaultTargetType === "Communities & Clubs" ? "Communities & Clubs" : "Individual KOLs";
  const [targetType, setTargetType] = useState<"Individual KOLs" | "Communities & Clubs">(initialType);
  const [keyword, setKeyword] = useState("");
  const [searchStrategy,setSearchStrategy]=useState<'apify'|'seed_content_v1'>('apify');
  const [experimentalInputs,setExperimentalInputs]=useState<ExperimentalInputs>(emptyExperimental);
  const experimental=searchStrategy==='seed_content_v1';
  const platformAvailable=(p:string)=>experimental || availability(p).available;
  const [platform, setPlatform] = useState<string[]>([]);
  const { availability, platforms, loading: capabilitiesLoading } = useScoutCapabilities(targetType === "Communities & Clubs" ? "communities" : "profiles");
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [limit, setLimit] = useState(5);
  const [geography, setGeography] = useState("Vietnam");
  const [entityTypes,setEntityTypes]=useState<EntityType[]>([]);
  const [sizeCriteria,setSizeCriteria]=useState<AccountSizeCriteria>({sizeMetric:'followers'});
  const [geographyMode,setGeographyMode]=useState<'profile'|'profile-or-recent-posts'>('profile-or-recent-posts');
  const [typeFilter,setTypeFilter]=useState('All');
  const [assessmentFilter,setAssessmentFilter]=useState('All');
  const [platformFilter,setPlatformFilter]=useState('All');
  const [locationFilter,setLocationFilter]=useState('');
  const [notes, setNotes] = useState("");

  const [queryVariants,setQueryVariants]=useState<string|undefined>();
  const [maxSessionUsd,setMaxSessionUsd]=useState<number|undefined>();
  const planCriteria={searchStrategy,...(experimental?{...experimentalInputs,seedUrls:experimentalInputs.seedUrls.map(u=>u.trim()).filter(Boolean),approvedKeywords:experimentalInputs.approvedKeywords.map(u=>u.trim()).filter(Boolean)}:{}),accountPolicyVersion:5,assessmentRevision:experimental?7:6,...sizeCriteria,entityTypes:selectedEntityTypes(targetType,entityTypes),geographyMode,keyword:keyword.trim(),targetType,platform,geography,limit,notes,queryVariants:queryVariants===undefined?undefined:queryVariants.split('\n').map(v=>v.trim()).filter(Boolean),maxSessionUsd};
  const searchPlan=useSearchPlan('preview',planCriteria,isOpen && step===1 && !!keyword.trim() && !!platform.length && (!experimental || experimentalInputs.keywordsApproved));

  useEffect(()=>{if(step===1 && !resumeSessionId)setExperimentalInputs(v=>({...v,keywordsApproved:false}));},[keyword,geography,targetType]);

  // Loading States
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);

  // Step 2 Candidates State

  const [sessionId, setSessionId] = useState("");
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [reviewTab, setReviewTab] = useState("Pending");
  const [decisions, setDecisions] = useState<Record<string, ProfileReviewDecision>>({});
  const [typeDrafts, setTypeDrafts] = useState<Record<string, EntityType>>({});
  const [candidateEdits, setCandidateEdits] = useState<Record<string, CandidateEditValues>>({});
  const [expandedEdits, setExpandedEdits] = useState<Set<string>>(new Set());
  const [savingReview, setSavingReview] = useState(false);
  const [candidates, setCandidates] = useState<DiscoveryCandidate[]>([]);
  const [importedQualifiedCount,setImportedQualifiedCount]=useState(0);
  const [effectiveQuery, setEffectiveQuery] = useState("");
  const [modifierApplied, setModifierApplied] = useState<string | undefined>();
  const [selectedUsernames, setSelectedUsernames] = useState<Set<string>>(new Set());
  const [seedAssessments,setSeedAssessments]=useState<{url:string;name:string;assessment:{resultGroup?:string;reasons?:string[]};contentEvidence?:{posts:{url:string;topic:boolean;excerpt:string}[]}}[]>([]);
  const [discoveryWarnings, setDiscoveryWarnings] = useState<string[]>([]);
  const [discoveryCounts, setDiscoveryCounts] = useState<{ providerCount: number; excludedCount: number; requestedCount: number; discardedDiscovery?: {url:string;name:string;reason:string}[] } | null>(null);

  useEffect(() => {
    if (initialCriteria) {
      setSearchStrategy(initialCriteria.searchStrategy || 'apify');setExperimentalInputs({...emptyExperimental,...initialCriteria});
      setKeyword(initialCriteria.keyword || ""); setTargetType(initialCriteria.targetType || initialType);
      setPlatform(Array.isArray(initialCriteria.platform) ? initialCriteria.platform : initialCriteria.platform ? [initialCriteria.platform] : []); setGeography(initialCriteria.geography || "Vietnam");
      setMaxSessionUsd(initialCriteria.maxSessionUsd);setQueryVariants(initialCriteria.queryVariants?.join('\n'));setSizeCriteria(savedSizeCriteria(initialCriteria));setEntityTypes(initialCriteria.entityTypes || []);setGeographyMode(initialCriteria.geographyMode || 'profile-or-recent-posts');setLimit(initialCriteria.limit || 5); setNotes(initialCriteria.notes || "");
    }
    if (resumeSessionId && isOpen) void handleSearchPreview({ preventDefault() {} } as React.FormEvent, resumeSessionId);
  }, [resumeSessionId, isOpen]);
  useEffect(() => {
    if (!resumeSessionId && !capabilitiesLoading && !experimental) setPlatform(previous => { const available = previous.filter(p => availability(p).available); return available.length ? available : platforms.slice(0, 1); });
  }, [platforms.join(","), targetType, capabilitiesLoading,experimental]);

  // Reset modal state on close
  const resetAndClose = () => {
    setStep(1);
    setCandidates([]);
    setTypeDrafts({});
    setImportedQualifiedCount(0);
    setDecisions({});
    setReviewed(new Set());
    setCandidateEdits({});
    setExpandedEdits(new Set());
    setSelectedUsernames(new Set());
    setModifierApplied(undefined);
    setSeedAssessments([]);
    setDiscoveryWarnings([]);
    setDiscoveryCounts(null);
    setTypeFilter('All');
    setAssessmentFilter('All');
    setPlatformFilter('All');
    setLocationFilter('');
    onClose();
  };
  const handleClose = () => {
    resetAndClose();
  };

  if (!isOpen) return null;

  // ─── STEP 1: PREVIEW CANDIDATES (NO DB COMMIT) ───
  const handleSearchPreview = async (e: React.FormEvent, resumeId?: string) => {
    e.preventDefault();
    const cleanKeyword = keyword.trim();
    if (!cleanKeyword && !resumeId) {
      toast.error("Please enter a search topic or keyword to discover candidate profiles!");
      return;
    }

    if (!resumeId && (!platform.length || platform.some(p => !platformAvailable(p)))) { toast.error("Choose an available platform before searching."); return; }
    if(!resumeId && !searchPlan.plan){toast.error(searchPlan.error || "Wait for the search plan to be ready.");return;}
    setSearching(true);
    try {
      const res = await scoutFetch("/api/sport-hub/scout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(resumeId ? { action: "resume", sessionId: resumeId } : {
          ...planCriteria,planHash:searchPlan.plan?.hash,
          action: "preview",
          keyword: cleanKeyword,
          targetType,
          platform,
          limit,
          geography,
          notes, uiContext: { source: source || "/scout" },
        }),
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        toast.error(result.error || "Failed to search candidate profiles from Apify");
        return;
      }

      if (!mounted.current) return;
      const importedIds = new Set(result.importedCandidateIds || []);
      setImportedQualifiedCount((result.candidates || []).filter((c:DiscoveryCandidate)=>importedIds.has(c.candidateId) && c.reviewState==='Matched' && !c.isExisting).length);
      let fetchedCandidates: DiscoveryCandidate[] = (result.candidates || []).filter((c: DiscoveryCandidate) => !importedIds.has(c.candidateId));
      // Replay admission on saved experimental results without changing stored review decisions.
      const discarded = [...(result.diagnostics?.discardedDiscovery || [])];
      if(result.criteria?.searchStrategy === 'seed_content_v1' || result.diagnostics?.assessmentVersion === 7) {
        fetchedCandidates = fetchedCandidates.filter(c => {
          if(result.reviewDecisions?.[c.candidateId] || c.isExisting || hasDiscoveryLead(c, result.criteria?.keyword || cleanKeyword)) return true;
          discarded.push({url:c.url,name:c.name,reason:'No observed topic hint, supporting content or seed connection. Search query is not evidence.'});
          return false;
        });
      }
      const restored: Record<string, ProfileReviewDecision> = result.reviewDecisions || {};
      const pendingCandidates = fetchedCandidates.filter(c => restored[c.candidateId]?.decision !== "approved" && restored[c.candidateId]?.decision !== "rejected");
      const defaultAssessment = pendingCandidates.some(c => c.reviewState === 'Matched' && !c.isExisting)
        ? 'Matched'
        : pendingCandidates.some(c => c.reviewState === 'Needs Review' && !c.isExisting)
        ? 'Needs Review'
        : pendingCandidates.length > 0
        ? 'All'
        : fetchedCandidates.some(c => c.reviewState === 'Matched' && !c.isExisting)
        ? 'Matched'
        : fetchedCandidates.some(c => c.reviewState === 'Needs Review' && !c.isExisting)
        ? 'Needs Review'
        : 'All';

      if (result.criteria) {
        const p = result.criteria;
        setSearchStrategy(p.searchStrategy || 'apify');
        setExperimentalInputs({...emptyExperimental,...p});
        setKeyword(p.keyword);
        setTargetType(p.targetType);
        setPlatform(Array.isArray(p.platform) ? p.platform : [p.platform]);
        setGeography(p.geography);
        setLimit(p.limit);
        setSizeCriteria(savedSizeCriteria(p));
        setMaxSessionUsd(p.maxSessionUsd);
        setQueryVariants(p.queryVariants?.join('\n'));
        setAssessmentFilter(defaultAssessment);
        setTypeFilter('All');
        setPlatformFilter('All');
        setLocationFilter('');
        setEntityTypes(p.entityTypes || []);
        setGeographyMode(p.geographyMode || 'profile');
      } else {
        setAssessmentFilter(defaultAssessment);
        setTypeFilter('All');
        setPlatformFilter('All');
        setLocationFilter('');
      }
      setSeedAssessments(result.searchExecution?.seedAssessments || []);
      setDiscoveryWarnings(result.warnings || []);
      setDiscoveryCounts({...{providerCount:(result.candidates || []).length,excludedCount:fetchedCandidates.filter(c=>c.reviewState === "Excluded").length,requestedCount:result.criteria?.limit || limit},...result.diagnostics,discardedDiscovery:[...new Map(discarded.map(hit=>[hit.url,hit])).values()]});
      setCandidates(fetchedCandidates);
      setTypeDrafts({});
      setSessionId(result.sessionId);
      setDecisions(restored);
      setReviewed(new Set(fetchedCandidates.filter(c => restored[c.candidateId]?.decision === "approved").map(c => c.candidateId)));
      const initialEdits: Record<string, CandidateEditValues> = {};
      const expected = (result.criteria?.targetType || targetType) === "Communities & Clubs" ? "Community" : "Individual";
      for (const [id, dec] of Object.entries(restored)) {
        if (dec.classification || dec.relevant !== undefined || dec.locationConfirmed !== undefined) {
          initialEdits[id] = {
            classification: (dec.classification as CandidateClassification) || expected,
            relevant: dec.relevant ?? (fetchedCandidates.find(c=>c.candidateId===id)?.assessment?.topic?.state === 'unknown' ? undefined : fetchedCandidates.find(c=>c.candidateId===id)?.relevant),
            locationConfirmed: dec.locationConfirmed ?? (fetchedCandidates.find(c=>c.candidateId===id)?.assessment?.geography?.state === 'unknown' ? undefined : fetchedCandidates.find(c=>c.candidateId===id)?.locationMatch),
          };
        }
      }
      setCandidateEdits(initialEdits);
      setExpandedEdits(new Set());
      setReviewTab("Pending");
      setEffectiveQuery(result.effectiveQuery || cleanKeyword);
      setModifierApplied(result.modifierApplied);

      setSelectedUsernames(new Set(fetchedCandidates.filter(c => restored[c.candidateId]?.decision === "approved").map(c => c.candidateId)));

      setStep(2);
      const qualified=result.counts?.qualifiedNew ?? fetchedCandidates.filter(c=>c.reviewState==='Matched' && !c.isExisting).length;
      const target=result.criteria?.limit || limit;
      if(qualified<target)toast.info(`${qualified}/${target} qualified new accounts. Missing evidence remains available for review.`);
      else toast.success(`${qualified}/${target} qualified new accounts. Review before importing.`);
    } catch (err: any) {
      toast.error(err.message || "Server connection error during candidate discovery");
    } finally {
      setSearching(false);
    }
  };

  // Helper: Determine expected classification based on targetType
  const getExpectedClassification = (): CandidateClassification => {
    return targetType === "Communities & Clubs" ? "Community" : "Individual";
  };

  // Helper: Retrieve current or initial candidate edit values
  const getCandidateEdit = (candidate: DiscoveryCandidate): CandidateEditValues => {
    const existing = candidateEdits[candidate.candidateId];
    if (existing) return candidate.entityAssessment ? {...existing,classification:legacyClassification(candidate.entityAssessment.reviewedType || candidate.entityAssessment.suggestedType)} : existing;

    const defaultClassification: CandidateClassification = candidate.entityAssessment
      ? legacyClassification(candidate.entityAssessment.reviewedType || candidate.entityAssessment.suggestedType)
      : candidate.classification || 'Unknown';

    return {
      classification: defaultClassification,
      relevant: candidate.assessment?.topic?.state === 'unknown' ? undefined : candidate.relevant===true,
      locationConfirmed: (candidate.assessment?.geography?.state ?? candidate.geographyAssessment?.state) === 'unknown' ? undefined : candidate.locationMatch===true,
    };
  };

  // Helper: Update a single candidate's edit state
  const updateCandidateEdit = (
    candidateId: string,
    candidate: DiscoveryCandidate,
    patch: Partial<CandidateEditValues>
  ) => {
    setCandidateEdits((prev) => {
      const current = prev[candidateId] || getCandidateEdit(candidate);
      return {
        ...prev,
        [candidateId]: {
          ...current,
          ...patch,
        },
      };
    });
  };

  const toggleEditExpanded = (candidateId: string) => {
    setExpandedEdits((prev) => {
      const next = new Set(prev);
      if (next.has(candidateId)) next.delete(candidateId);
      else next.add(candidateId);
      return next;
    });
  };

  const attributesChanged = (candidate: DiscoveryCandidate) => {
    const edit=candidateEdits[candidate.candidateId];
    if(!edit)return false;
    const topic=candidate.assessment?.topic?.state,location=candidate.assessment?.geography?.state;
    return edit.relevant !== (topic==='unknown'?undefined:topic==='passed') || edit.locationConfirmed !== (location==='unknown'?undefined:location==='passed');
  };
  const candidateApprovalBlockers = (candidate: DiscoveryCandidate) => [...(candidate.assessmentVersion===7 && attributesChanged(candidate)?['Save topic and location changes first.']:[]),...approvalBlockers(candidate,getExpectedClassification(),getCandidateEdit(candidate),typeDrafts[candidate.candidateId])];
  async function saveAttributes(candidate: DiscoveryCandidate){
    setSavingReview(true);
    try{
      const edit=getCandidateEdit(candidate);
      const response=await scoutFetch('/api/sport-hub/scout/attributes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId,candidateId:candidate.candidateId,topic:edit.relevant===undefined?'unknown':edit.relevant?'passed':'failed',geography:edit.locationConfirmed===undefined?'unknown':edit.locationConfirmed?'passed':'failed'})});
      const result=await response.json();if(!response.ok || !result.success)throw new Error(result.error || 'Unable to save attributes.');
      setCandidates(prev=>prev.map(c=>c.candidateId===candidate.candidateId?result.candidate:c));
      setCandidateEdits(prev=>{const next={...prev};delete next[candidate.candidateId];return next;});
      setDecisions(prev=>{const next={...prev};delete next[candidate.candidateId];return next;});
      setSelectedUsernames(prev=>{const next=new Set(prev);next.delete(candidate.candidateId);return next;});
      toast.success('Topic and location saved as team review. Review the updated profile before approving.');
    }catch(error:any){toast.error(error.message);}finally{setSavingReview(false);}
  }
  const isCandidateReadyToApprove = (candidate: DiscoveryCandidate) => candidateApprovalBlockers(candidate).length === 0;

  // Quick feedback submission and candidate exclusion
  const handleFeedbackAndReject = async (
    candidate: DiscoveryCandidate,
    reason: string,
    classification?: string,
    entityType?:EntityType
  ) => {
    setSavingReview(true);
    try {
      const response = await fetch("/api/sport-hub/scout/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          candidateId: candidate.candidateId,
          reason,
          classification: classification || undefined,
          entityType,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to record feedback.");
      toast.success(result.candidate?'Correction saved. Review the updated assessment.':'Feedback recorded and profile excluded.');
      setCandidates(prev=>result.candidate?prev.map(c=>c.candidateId===candidate.candidateId?result.candidate:c):prev.filter(c=>c.candidateId!==candidate.candidateId));
      if(result.candidate){setTypeDrafts(prev=>{const next={...prev};delete next[candidate.candidateId];return next;});setDecisions(prev=>{const next={...prev};delete next[candidate.candidateId];return next;});setCandidateEdits(prev=>{const next={...prev};if(next[candidate.candidateId])next[candidate.candidateId]={...next[candidate.candidateId],classification:legacyClassification(result.candidate.entityAssessment.reviewedType || result.candidate.entityAssessment.suggestedType)};return next;});}
      setSelectedUsernames((prev) => {
        const next = new Set(prev);
        next.delete(candidate.candidateId);
        return next;
      });
    } catch (error: any) {
      const rawMsg = error?.message || "Failed to record feedback";
      const msg = typeof rawMsg === 'string' && /^<html/i.test(rawMsg.trim())
        ? rawMsg.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || "Failed to record feedback"
        : rawMsg;
      toast.error(msg);
    } finally {
      setSavingReview(false);
    }
  };

  // ─── STEP 2: CONFIRM & INGEST SELECTED CANDIDATES ───
  const handleConfirmImport = async () => {
    const selected = candidates.filter((c) => selectedUsernames.has(c.candidateId) && decisions[c.candidateId]?.decision === "approved");
    if (selected.length === 0) {
      toast.error("Please select at least one candidate profile to import!");
      return;
    }

    setImporting(true);
    try {
      const res = await scoutFetch("/api/sport-hub/scout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirm",
          sessionId,
          selected: selected.map((c) => {
            const edit = getCandidateEdit(c);
            return {
              candidateId: c.candidateId,
              classification: edit.classification,
              relevant: edit.relevant,
              locationConfirmed: edit.locationConfirmed,
            };
          }),
          targetType,
          platform,
          geography,
          keyword: effectiveQuery || keyword.trim(),
          notes,
        }),
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        toast.error(result.error || "Failed to import selected candidate profiles");
        return;
      }

      toast.success(
        result.summary ||
          `Successfully imported ${selected.length} profile(s) into database!`
      );

      if(mounted.current){
        setImportedQualifiedCount(n=>n+selected.filter(c=>c.reviewState==='Matched' && !c.isExisting).length);
        const imported=new Set(selected.map(c=>c.candidateId));
        setCandidates(prev=>prev.filter(c=>!imported.has(c.candidateId)));
        setSelectedUsernames(new Set());
      }
      if (mounted.current && onSuccess) onSuccess({ ...result, sessionId });
      if (onScoutSuccess) onScoutSuccess();
      if (mounted.current && !keepResultOpen) resetAndClose();
    } catch (err: any) {
      console.error("Discovery Confirm Error:", err);
      toast.error(err.message || "Server connection error during profile import");
    } finally {
      setImporting(false);
    }
  };

  // Toggle single candidate selection (permits selecting pending candidates for batch review)
  const toggleCandidate = (candidateId: string) => {
    setSelectedUsernames((prev) => {
      const next = new Set(prev);
      if (next.has(candidateId)) {
        next.delete(candidateId);
      } else {
        next.add(candidateId);
      }
      return next;
    });
  };

  // Quick Selection Helpers
  const selectAll = () => {
    const tabCandidates = candidates.filter((c) => reviewStatus(c) === reviewTab && matchesFilters(c));
    setSelectedUsernames((prev) => {
      const next = new Set(prev);
      for (const c of tabCandidates) next.add(c.candidateId);
      return next;
    });
  };

  const selectAllPending = () => {
    const pending = candidates.filter((c) => reviewStatus(c) === "Pending" && matchesFilters(c));
    setSelectedUsernames((prev) => {
      const next = new Set(prev);
      for (const c of pending) next.add(c.candidateId);
      return next;
    });
  };

  const deselectAll = () => {
    setSelectedUsernames(new Set());
  };

  const selectNewOnly = () => {
    setSelectedUsernames(
      new Set(candidates.filter((c) => !c.isExisting && reviewStatus(c) === reviewTab).map((c) => c.candidateId))
    );
  };

  // Batch Review Handler
  async function saveBatchReview(
    targetCandidates: DiscoveryCandidate[],
    decision: ProfileReviewDecision['decision']
  ) {
    if (targetCandidates.length === 0) return;
    const expected = getExpectedClassification();
    const eligible = targetCandidates.filter((c) => decision !== "approved" || isCandidateReadyToApprove(c));
    if (eligible.length === 0) {
      const wrongType = targetCandidates.filter((c) => getCandidateEdit(c).classification !== expected);
      const failedMetric = targetCandidates.filter((c) => ['followers', 'members'].some(m => c.assessment?.[m] && c.assessment[m].state !== 'passed'));
      if (wrongType.length > 0) {
        toast.error(`${wrongType.length} selected profile(s) have entity types that do not match '${expected === "Community" ? "Community / Club" : "Individual Creator"}'. Please update their entity type first.`);
      } else if (failedMetric.length > 0) {
        toast.error(`${failedMetric.length} selected profile(s) do not meet the follower/member requirements.`);
      } else {
        toast.error("None of the selected profiles meet the approval criteria. Check entity type, topic, and location.");
      }
      return;
    }

    setSavingReview(true);
    try {
      const isApproving = decision === "approved";
      const reviews = eligible.map((c) => {
        const edit = getCandidateEdit(c);
        const targetEntityType: EntityType | undefined = c.entityAssessment
          ? (edit.classification === 'Individual'
              ? 'Individual'
              : edit.classification === 'Community'
              ? (c.entityAssessment.suggestedType === 'Club' ? 'Club' : 'Community')
              : edit.classification === 'Brand/Business'
              ? 'Brand/Business'
              : c.entityAssessment.reviewedType || c.entityAssessment.suggestedType || 'Unknown')
          : undefined;

        return {
          candidateId: c.candidateId,
          decision,
          typeConfirmed: isApproving ? true : (edit.classification === expected),
          entityType: targetEntityType,
          relevant: isApproving ? (edit.relevant !== false) : edit.relevant,
          locationConfirmed: isApproving ? (edit.locationConfirmed !== false) : edit.locationConfirmed,
        };
      });

      const response = await scoutFetch("/api/sport-hub/scout/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          reviews,
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Unable to save batch review decisions.");
      }
      if (!mounted.current) return;

      const newDecisions = result.decisions || {};
      setDecisions((prev) => ({ ...prev, ...newDecisions }));
      if (isApproving) {
        setCandidateEdits((prev) => {
          const next = { ...prev };
          for (const c of eligible) {
            next[c.candidateId] = {
              ...getCandidateEdit(c),
              classification: expected,
              relevant: true,
              locationConfirmed: true,
            };
          }
          return next;
        });
      }
      setReviewed((prev) => {
        const next = new Set(prev);
        for (const c of eligible) {
          if (decision === "approved") next.add(c.candidateId);
          else next.delete(c.candidateId);
        }
        return next;
      });

      if (decision === "approved") {
        setSelectedUsernames((prev) => {
          const next = new Set(prev);
          for (const c of eligible) {
            next.add(c.candidateId);
          }
          return next;
        });
        toast.success(`Successfully approved ${eligible.length} profile(s)! Ready for CRM import.`);
      } else if (decision === "rejected") {
        setSelectedUsernames((prev) => {
          const next = new Set(prev);
          for (const c of eligible) {
            next.delete(c.candidateId);
          }
          return next;
        });
        toast.success(`Marked ${eligible.length} profile(s) as rejected.`);
      } else {
        toast.success(`Returned ${eligible.length} profile(s) to pending review.`);
      }
      if (assessmentFilter === 'Matched') {
        const batchIds = new Set(eligible.map(c => c.candidateId));
        const remainingPending = candidates.filter(c =>
          !batchIds.has(c.candidateId) &&
          decisions[c.candidateId]?.decision !== "approved" &&
          decisions[c.candidateId]?.decision !== "rejected"
        );
        const remainingMatched = remainingPending.filter(c => c.reviewState === 'Matched' && !c.isExisting).length;
        const remainingNeedsReview = remainingPending.filter(c => c.reviewState === 'Needs Review' && !c.isExisting).length;
        if (remainingMatched === 0 && remainingNeedsReview > 0) {
          setAssessmentFilter('Needs Review');
        }
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to save batch review.");
    } finally {
      setSavingReview(false);
    }
  }

  async function saveReview(candidate: DiscoveryCandidate, decision: ProfileReviewDecision['decision']) {
    setSavingReview(true);
    try {
      const edit = getCandidateEdit(candidate);
      const expected = getExpectedClassification();
      const isApproving = decision === "approved";
      const typeConfirmed = isApproving ? true : (edit.classification === expected);

      const targetEntityType: EntityType | undefined = candidate.entityAssessment
        ? (edit.classification === 'Individual'
            ? 'Individual'
            : edit.classification === 'Community'
            ? (candidate.entityAssessment.suggestedType === 'Club' ? 'Club' : 'Community')
            : edit.classification === 'Brand/Business'
            ? 'Brand/Business'
            : candidate.entityAssessment.reviewedType || candidate.entityAssessment.suggestedType || 'Unknown')
        : undefined;

      const relevant = isApproving ? (edit.relevant !== false) : edit.relevant;
      const locationConfirmed = isApproving ? (edit.locationConfirmed !== false) : edit.locationConfirmed;

      const response = await scoutFetch("/api/sport-hub/scout/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          candidateId: candidate.candidateId,
          decision,
          typeConfirmed,
          entityType: targetEntityType,
          relevant,
          locationConfirmed,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Unable to save the review decision.");
      if (!mounted.current) return;
      setDecisions(previous => ({ ...previous, [candidate.candidateId]: result.decision }));
      if (isApproving) {
        setCandidateEdits(prev => ({
          ...prev,
          [candidate.candidateId]: {
            ...edit,
            classification: expected,
            relevant: true,
            locationConfirmed: true,
          }
        }));
      }
      setReviewed(previous => {
        const next = new Set(previous);
        if (decision === "approved") next.add(candidate.candidateId);
        else next.delete(candidate.candidateId);
        return next;
      });
      setSelectedUsernames(previous => {
        const next = new Set(previous);
        if (decision === "approved") next.add(candidate.candidateId);
        else next.delete(candidate.candidateId);
        return next;
      });
      if (assessmentFilter === 'Matched') {
        const remainingPending = candidates.filter(c =>
          c.candidateId !== candidate.candidateId &&
          (c.candidateId === candidate.candidateId ? decision : decisions[c.candidateId]?.decision) !== "approved" &&
          (c.candidateId === candidate.candidateId ? decision : decisions[c.candidateId]?.decision) !== "rejected"
        );
        const remainingMatched = remainingPending.filter(c => c.reviewState === 'Matched' && !c.isExisting).length;
        const remainingNeedsReview = remainingPending.filter(c => c.reviewState === 'Needs Review' && !c.isExisting).length;
        if (remainingMatched === 0 && remainingNeedsReview > 0) {
          setAssessmentFilter('Needs Review');
        }
      }
      toast.success(
        decision === "approved"
          ? "Approved for import. Decision saved."
          : decision === "rejected"
          ? "Rejected for this preview. Decision saved."
          : "Returned to pending review."
      );
    } catch (error: any) {
      toast.error(error.message || "Unable to save the review decision.");
    } finally {
      setSavingReview(false);
    }
  }
  const reviewStatus = (candidate: DiscoveryCandidate) => decisions[candidate.candidateId]?.decision === "approved" ? "Approved" : decisions[candidate.candidateId]?.decision === "rejected" ? "Rejected" : "Pending";
  const matchesFilters=(c:DiscoveryCandidate)=>(typeFilter==='All' || (c.entityAssessment?.suggestedType || c.classification)===typeFilter) && (assessmentFilter==='All' || assessmentFilter==='In CRM'?assessmentFilter==='All' || c.isExisting:c.reviewState===assessmentFilter && !c.isExisting) && (platformFilter==='All' || c.platform===platformFilter) && (!locationFilter.trim() || (c.geographyAssessment?.observations || []).some(o=>(o.canonical || o.raw).toLowerCase().includes(locationFilter.trim().toLowerCase())));
  const switchReviewTab = (nextTab: string) => {
    setReviewTab(nextTab);
    const tabCandidates = candidates.filter(c => reviewStatus(c) === nextTab);
    if (tabCandidates.length > 0) {
      const matchesCurrent = tabCandidates.some(c => matchesFilters(c));
      if (!matchesCurrent) {
        if (nextTab === 'Pending') {
          const hasMatched = tabCandidates.some(c => c.reviewState === 'Matched' && !c.isExisting);
          const hasNeedsReview = tabCandidates.some(c => c.reviewState === 'Needs Review' && !c.isExisting);
          setAssessmentFilter(hasMatched ? 'Matched' : hasNeedsReview ? 'Needs Review' : 'All');
        } else if (nextTab === 'Rejected') {
          setAssessmentFilter(tabCandidates.some(c => c.reviewState === 'Excluded') ? 'Excluded' : 'All');
        } else {
          setAssessmentFilter('All');
        }
      }
    }
  };
  const totalPendingCount = candidates.filter(c => reviewStatus(c) === "Pending").length;
  const pendingCount = candidates.filter(c => reviewStatus(c) === "Pending" && matchesFilters(c)).length;
  const approvedSelectedCount = candidates.filter(c => selectedUsernames.has(c.candidateId) && reviewStatus(c) === "Approved").length;

  const qualifiedNewCount=importedQualifiedCount+candidates.filter(c=>c.reviewState==='Matched' && !c.isExisting).length;
  const newCandidatesCount = candidates.filter((c) => !c.isExisting).length;
  const existingCandidatesCount = candidates.filter((c) => c.isExisting).length;

  const reviewFooter = step === 2 ? (<>
    <p className="mb-3 text-xs text-slate-600" role="status">{totalPendingCount} pending review · {candidates.filter(c => reviewStatus(c) === "Approved").length} approved. Approval allows CRM import; new profiles retain New Scout (Unverified) status.</p>
            {/* Step 2 Bottom Action Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
              <button
                type="button"
                disabled={importing || savingReview}
                onClick={() => setStep(1)}
                className="px-3.5 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Search</span>
              </button>

              <div className="flex items-center justify-end space-x-2.5">
                <button
                  type="button"
                  disabled={importing || savingReview}
                  onClick={handleClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer disabled:opacity-50"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={approvedSelectedCount === 0 || importing || savingReview}
                  onClick={handleConfirmImport}
                  className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 rounded-xl transition shadow-md flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  title={approvedSelectedCount === 0 ? "Approve candidate profiles before importing" : "Import approved candidate profiles into CRM"}
                >
                  {importing ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                  )}
                  <span>
                    {importing
                      ? "Importing to CRM..."
                      : `Import Approved Profiles (${approvedSelectedCount})`}
                  </span>
                </button>
              </div>
            </div>
  </>) : undefined;

  return (
    <ScoutDialogFrame
      title={step === 1 ? "Find Profiles" : "Review Profiles"}
      description={step === 2 && (effectiveQuery || keyword) ? (effectiveQuery || keyword) : "Search for KOLs or communities. Review candidates before adding them to your directory."}
      onClose={handleClose}
      wide
      footer={reviewFooter}
    >
        {/* ─── STEP PROGRESS BAR ─── */}
        <div className="bg-slate-50 border-b border-slate-100 px-6 py-2.5 flex items-center justify-between text-xs shrink-0">
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => {
                if (!searching && !importing && !savingReview && step === 2) setStep(1);
              }}
              disabled={searching || importing || savingReview || step === 1}
              className={`flex items-center space-x-1.5 font-bold transition ${
                step === 1
                  ? "text-indigo-600"
                  : "text-slate-600 hover:text-indigo-600 cursor-pointer"
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  step === 1
                    ? "bg-indigo-600 text-white"
                    : "bg-emerald-500 text-white"
                }`}
              >
                {step === 2 ? "✓" : "1"}
              </div>
              <span>1. Search Criteria</span>
            </button>

            <span className="text-slate-300 font-bold">/</span>

            <div
              className={`flex items-center space-x-1.5 font-bold ${
                step === 2 ? "text-indigo-600" : "text-slate-400"
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  step === 2
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-200 text-slate-600"
                }`}
              >
                2
              </div>
              <span>2. Review Candidates ({candidates.length})</span>
            </div>
          </div>

          {step === 2 && (
            <button
              type="button"
              onClick={() => setStep(1)}
              disabled={importing || savingReview}
              className="text-[11px] text-indigo-600 hover:text-indigo-800 font-bold flex items-center space-x-1 cursor-pointer"
            >
              <ArrowLeft className="w-3 h-3" />
              <span>Edit Criteria</span>
            </button>
          )}
        </div>

        {/* ─── STEP 1 BODY: SEARCH FORM ─── */}
        {step === 1 && (
          <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
            {/* Informational Callout */}
            <div className="bg-blue-50 border border-blue-200/80 rounded-2xl p-3.5 flex items-start space-x-3 text-xs text-blue-900">
              <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold leading-relaxed">
                  2-Step Discovery Protocol: <strong>Preview before Import</strong>
                </p>
                <p className="text-blue-700 mt-0.5 leading-relaxed text-[11px]">
                  Step 1 queries live social media to retrieve candidate profile names and links. You can then review accounts, inspect their live profile links, and decide exactly which ones to add into your database.
                </p>
              </div>
            </div>

            {/* Target Type Selector Tabs */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">
                What are you looking to discover?
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTargetType("Individual KOLs");
                    setPlatform([]);
                  }}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 border cursor-pointer ${
                    targetType === "Individual KOLs"
                      ? "bg-indigo-50 border-indigo-600 text-indigo-700 shadow-2xs"
                      : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>KOLs & Creators</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setTargetType("Communities & Clubs");
                    setPlatform([]);
                  }}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 border cursor-pointer ${
                    targetType === "Communities & Clubs"
                      ? "bg-indigo-50 border-indigo-600 text-indigo-700 shadow-2xs"
                      : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Communities & Clubs</span>
                </button>
              </div>
            </div>

            <form onSubmit={handleSearchPreview} className="space-y-4 pt-1">
              <p className="text-xs text-slate-500">Running tasks and saved previews are available in <a href="/scout" className="underline">Scout Activity</a>.</p>
              <label className="block text-xs font-semibold">Search strategy<select className="ml-2 rounded-lg border p-2" value={searchStrategy} onChange={e=>{setSearchStrategy(e.target.value as 'apify'|'seed_content_v1');setExperimentalInputs(v=>({...v,keywordsApproved:false}));}}><option value="apify">Current Search (Apify)</option><option value="seed_content_v1">Experimental Search</option></select></label>
              {/* Search Keyword */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Search Query / Niche Keyword <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    required
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder={
                      targetType === "Individual KOLs"
                        ? "e.g. Pickleball Vietnam, Runner Hanoi, Badminton..."
                        : "e.g. Hoi Yeu Chay Bo, Pickleball Sai Gon, CLB Cau Long..."
                    }
                    className="w-full pl-10 pr-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                {/* Quick Preset Chips */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className="text-[10px] text-slate-400 font-semibold py-0.5">
                    Popular topics:
                  </span>
                  {PRESET_TOPICS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setKeyword(preset)}
                      className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 transition font-medium cursor-pointer"
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Platform & Limit Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Platform
                  </label>
                  <fieldset aria-label="Platforms" className="space-y-2">
                    {SCOUT_PLATFORMS.map(p => <label key={p} className="flex items-start gap-2 text-xs text-slate-700">
                      <input type="checkbox" checked={platform.includes(p)} disabled={!platformAvailable(p) || searching} onChange={e => setPlatform(previous => e.target.checked ? [...previous, p] : previous.filter(value => value !== p))} className="mt-0.5 accent-indigo-600" />
                      <span>{p}{!platformAvailable(p) && <span className="block text-slate-500">{availability(p).reason}</span>}</span>
                    </label>)}
                  </fieldset>
                  <p className="mt-2 text-xs text-slate-500">Select one or more platforms. All eligible profiles collected across these platforms are returned.</p>
                  <p className="mt-2 text-xs text-slate-500">Highest observed followers or members first, then average views and engagement rate. Unknown metrics are placed after observed values. Ranking applies to the retrieved candidate pool.</p>
                  {platform.includes("Facebook") && <p className="mt-2 text-xs text-slate-500">Facebook discovery enriches incomplete profiles before assessment, within the reviewed Scout budget. This may incur additional provider usage. Inaccessible metrics remain Unknown.</p>}
                </div>

              </div>

              {/* Geography & Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Target Geography
                  </label>
                  <select
                    value={geography}
                    onChange={(e) => setGeography(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    <option value="Vietnam">Vietnam</option>
                    <option value="Any location">Any location</option>
                    <option value="Nationwide">Nationwide (no location filter)</option>
                    <option value="Hanoi">Hanoi</option>
                    <option value="Ho Chi Minh City">Ho Chi Minh City</option>
                    <option value="Da Nang">Da Nang</option>
                  </select>
                </div>

              </div>
              <details className="space-y-3"><summary className="cursor-pointer text-sm font-semibold">Advanced</summary>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Minimum Candidate Profiles
                  </label>
                  <select
                    value={limit}
                    onChange={(e) => setLimit(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    <option value={5}>5 candidate profiles</option>
                    <option value={10}>10 candidate profiles</option>
                    <option value={15}>15 candidate profiles</option>
                    <option value={20}>20 candidate profiles</option>
                  </select>
                  <p className="text-[11px] text-slate-500 mt-1">Minimum target across all selected platforms. All eligible profiles collected are returned; results may exceed this target or fall short if the provider or budget is limited.</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Note / Tag (Optional)
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Q3 Summer campaign scouting"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
              </details>
              <fieldset className="rounded-xl border border-slate-200 p-3 space-y-2 text-xs"><legend className="font-semibold">Account types</legend>
                <div className="flex flex-wrap gap-3">{ENTITY_TYPES.map(type=><label key={type} className="flex items-center gap-1"><input type="checkbox" checked={selectedEntityTypes(targetType,entityTypes).includes(type)} onChange={event=>{const current=selectedEntityTypes(targetType,entityTypes);const next=event.target.checked?[...current,type]:current.filter(value=>value!==type);if(next.length)setEntityTypes(next);}}/>{t(type)}</label>)}</div>
                <label className="block">Geography evidence <select value={geographyMode} onChange={event=>setGeographyMode(event.target.value as typeof geographyMode)} className="rounded border p-1"><option value="profile-or-recent-posts">Profile or sampled owned posts</option><option value="profile">Profile only</option></select></label>
                <p>Locations mentioned in captions or hashtags remain available for verification. Account followers are separate from club members.</p>
              </fieldset>
              <AccountSizeFields value={sizeCriteria} onChange={setSizeCriteria}/>
              {experimental && <ExperimentalScoutFields value={experimentalInputs} onChange={setExperimentalInputs} topic={keyword} geography={geography} target={targetType}/>}
              <ScoutSearchPlan {...searchPlan} variants={queryVariants} onVariants={setQueryVariants} budget={maxSessionUsd} onBudget={setMaxSessionUsd}/>
              {!experimental && !platforms.length && <p role="status" className="text-xs text-amber-800">{SCOUT_PLATFORMS.map(p => `${p}: ${availability(p).reason}`).join(" · ")}</p>}

              {/* Progress Indicator when Searching */}
              {searching && (
                <div className="bg-purple-50 border border-purple-200 rounded-2xl p-3.5 flex items-center space-x-3 text-xs text-purple-900 animate-pulse">
                  <RefreshCw className="w-5 h-5 text-purple-600 animate-spin shrink-0" />
                  <div>
                    <p className="font-bold">{resumeSessionId ? 'Loading Saved Task...' : 'Discovering Candidate Profiles...'}</p>
                    <p className="text-[11px] text-purple-700 mt-0.5 leading-relaxed">
                      {resumeSessionId ? 'Loading saved task status, profile evidence and review decisions.' : <>Crawling live {platform.join(", ")} profiles for &ldquo;{keyword}&rdquo;, extracting profile links and cross-checking with existing CRM records.</>}
                    </p>
                  </div>
                </div>
              )}

              {/* Modal Step 1 Actions */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2.5">
                <button
                  type="button"
                  disabled={searching}
                  onClick={handleClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={searching || !searchPlan.plan || searchPlan.loading || (!platform.length || platform.some(p => !platformAvailable(p)))}
                  className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 active:scale-95 rounded-xl transition shadow-md flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  {searching ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Search className="w-3.5 h-3.5 text-amber-300" />
                  )}
                  <span>
                    {searching ? (resumeSessionId ? 'Loading Saved Task...' : 'Finding Candidate Profiles...') : 'Start Scout'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ─── STEP 2 BODY: CANDIDATE REVIEW & SELECTION LIST ─── */}
        {step === 2 && (
          <div className="space-y-4">
            {/* Top Discovery Summary Banner */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-slate-800">
                  Topic: &ldquo;{effectiveQuery || keyword}&rdquo;
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 font-semibold">
                  {platform.join(", ")}
                </span>
                {modifierApplied && (
                  <span
                    title="Sub-niche modifier applied to find unindexed profiles outside existing CRM records"
                    className="text-[10px] px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-bold border border-amber-200"
                  >
                    + Sub-niche: {modifierApplied}
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-2 text-xs font-semibold">
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  {qualifiedNewCount}/{limit} qualified new accounts
                </span>
                <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                  {existingCandidatesCount} In CRM
                </span>
              </div>
            </div>

            {importedQualifiedCount>0 && <p className="text-xs text-emerald-700">{formatNumber(importedQualifiedCount)} qualified accounts imported from this search. Saved review decisions are retained.</p>}
            {discoveryCounts && <p className="text-xs text-slate-600">{discoveryCounts.providerCount} provider results · {candidates.filter(c => c.reviewState === 'Needs Review').length} need verification · {candidates.filter(c => c.reviewState === 'Excluded').length} excluded</p>}
            {!!discoveryCounts?.discardedDiscovery?.length && <details className="rounded-lg border border-slate-200 p-3 text-xs text-slate-600"><summary className="cursor-pointer font-semibold">Discarded discovery hits ({discoveryCounts.discardedDiscovery.length.toLocaleString('en-US')})</summary><p className="mt-2">These provider hits lack a topic hint or seed connection. They are not review candidates; their accounts have not been classified as off-topic.</p><ul className="mt-2 space-y-1">{discoveryCounts.discardedDiscovery.map(hit=><li key={hit.url}><a href={hit.url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline">{hit.name || hit.url}</a> · {hit.reason}</li>)}</ul></details>}
            {seedAssessments.length>0 && <details className="rounded-xl border border-slate-200 p-3 text-xs"><summary className="cursor-pointer font-semibold">Seed verification ({formatNumber(seedAssessments.length)}) · excluded from new-account target</summary>
              <p className="mt-2">Seed accounts guide discovery. These assessments do not approve CRM import.</p>
              {seedAssessments.map(seed=><section key={seed.url} className="mt-2 border-t pt-2"><a href={seed.url} target="_blank" rel="noreferrer" className="underline">{seed.name || seed.url}</a><span> · {t(seed.assessment.resultGroup || 'Needs Verification')}</span>{seed.assessment.reasons?.map((reason,index)=><p key={index}>{reason}</p>)}{seed.contentEvidence?.posts.filter(post=>post.topic).map(post=><p key={post.url}><a href={post.url} target="_blank" rel="noreferrer" className="underline">View supporting post</a>: {post.excerpt}</p>)}</section>)}
            </details>}
            {discoveryWarnings.length > 0 && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">{discoveryWarnings.map((warning, index) => <p key={index}>{warning}</p>)}</div>}

            <p className="text-xs text-slate-600">{Math.max(0,limit-qualifiedNewCount)} still needed · Search stopped: {String((discoveryCounts as any)?.stopReason || 'available-evidence-exhausted').replaceAll('-', ' ')}</p>
            {/* Review Status Tabs & Batch Action Toolbar */}
            <div className="space-y-2.5 shrink-0">
              {/* Tabs Row */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                <div className="flex gap-1.5">
                  {[
                    { key: "Pending", count: totalPendingCount },
                    { key: "Approved", count: candidates.filter(c => reviewStatus(c) === "Approved").length },
                    { key: "Rejected", count: candidates.filter(c => reviewStatus(c) === "Rejected").length },
                  ].map(tab => {
                    const isActive = reviewTab === tab.key;
                    return (
                      <button
                        type="button"
                        key={tab.key}
                        onClick={() => switchReviewTab(tab.key)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer ${
                          isActive
                            ? "bg-indigo-600 text-white shadow-xs"
                            : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                        }`}
                      >
                        <span>{tab.key}</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                          isActive ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
                        }`}>
                          {tab.count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="text-xs font-semibold text-slate-600">
                  Selected: <span className="font-extrabold text-indigo-600">{selectedUsernames.size}</span> of {candidates.length}
                </div>
              </div>

              {/* Selection & Batch Actions Strip */}
              <div className="bg-slate-50/80 border border-slate-200/90 rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                {/* Left: Quick Select Controls */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">Select:</span>
                  <button
                    type="button"
                    disabled={savingReview || importing || candidates.filter(c => reviewStatus(c) === reviewTab && matchesFilters(c)).length === 0}
                    onClick={selectAll}
                    className="px-2.5 py-1 rounded-md bg-white border border-slate-200 hover:border-slate-300 text-slate-700 font-semibold text-[11px] transition shadow-2xs cursor-pointer disabled:opacity-50"
                  >
                    All in {reviewTab} ({candidates.filter(c => reviewStatus(c) === reviewTab && matchesFilters(c)).length})
                  </button>

                  {reviewTab !== "Pending" && pendingCount > 0 && (
                    <button
                      type="button"
                      disabled={savingReview || importing}
                      onClick={selectAllPending}
                      className="px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-800 font-semibold text-[11px] transition shadow-2xs cursor-pointer disabled:opacity-50"
                    >
                      All Pending ({pendingCount})
                    </button>
                  )}

                  {selectedUsernames.size > 0 && (
                    <button
                      type="button"
                      disabled={savingReview || importing}
                      onClick={deselectAll}
                      className="px-2.5 py-1 rounded-md bg-white border border-slate-200 hover:bg-slate-100 text-slate-500 font-medium text-[11px] transition cursor-pointer"
                    >
                      Deselect All
                    </button>
                  )}
                </div>

                {/* Right: Batch Approval Actions */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* If user has selected pending candidates */}
                  {candidates.filter(c => selectedUsernames.has(c.candidateId) && reviewStatus(c) === "Pending").length > 0 && (
                    <button
                      type="button"
                      disabled={savingReview || importing}
                      onClick={() => saveBatchReview(candidates.filter(c => selectedUsernames.has(c.candidateId) && reviewStatus(c) === "Pending"), "approved")}
                      className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                      title="Approve all selected pending candidates with current attribute edits"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Approve Selected ({candidates.filter(c => selectedUsernames.has(c.candidateId) && reviewStatus(c) === "Pending").length})</span>
                    </button>
                  )}

                  {/* If in Pending tab and no candidates specifically checked yet: quick 1-click Approve All Pending */}
                  {reviewTab === "Pending" && candidates.filter(c => selectedUsernames.has(c.candidateId) && reviewStatus(c) === "Pending").length === 0 && pendingCount > 0 && (
                    <button
                      type="button"
                      disabled={savingReview || importing}
                      onClick={() => saveBatchReview(candidates.filter(c => reviewStatus(c) === "Pending" && matchesFilters(c)), "approved")}
                      className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                      title="Approve all pending candidates at once with verified default attributes"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Approve All Pending ({pendingCount})</span>
                    </button>
                  )}

                  {/* Batch Reject for Selected Pending */}
                  {candidates.filter(c => selectedUsernames.has(c.candidateId) && reviewStatus(c) === "Pending").length > 0 && (
                    <button
                      type="button"
                      disabled={savingReview || importing}
                      onClick={() => saveBatchReview(candidates.filter(c => selectedUsernames.has(c.candidateId) && reviewStatus(c) === "Pending"), "rejected")}
                      className="px-2.5 py-1.5 rounded-lg border border-red-200 hover:bg-red-50 text-red-700 font-bold text-xs transition cursor-pointer disabled:opacity-50"
                    >
                      Reject ({candidates.filter(c => selectedUsernames.has(c.candidateId) && reviewStatus(c) === "Pending").length})
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-xs" aria-label="Filter Scout results">
              <label>Type <select aria-label="Type" value={typeFilter} onChange={e=>setTypeFilter(e.target.value)} className="border rounded p-1"><option value="All">All types</option>{ENTITY_TYPES.map(type=><option key={type} value={type}>{t(type)}</option>)}</select></label>
              <label>Assessment <select aria-label="Assessment" value={assessmentFilter} onChange={e=>setAssessmentFilter(e.target.value)} className="border rounded p-1"><option value="All">All assessments</option><option value="Matched">Qualified</option><option value="Needs Review">Needs Verification</option><option value="Excluded">Excluded</option><option value="In CRM">In CRM</option></select></label>
              <label>Platform <select aria-label="Platform" value={platformFilter} onChange={e=>setPlatformFilter(e.target.value)} className="border rounded p-1"><option value="All">All platforms</option>{SCOUT_PLATFORMS.map(p=><option key={p} value={p}>{t(p)}</option>)}</select></label>
              <label>Observed location <input value={locationFilter} onChange={e=>setLocationFilter(e.target.value)} placeholder="Filter observed locations" className="border rounded p-1"/></label>
            </div>
            {/* Candidate Cards Scrollable List */}
            <div className="space-y-2.5">
              {!candidates.some(c => reviewStatus(c) === reviewTab && matchesFilters(c)) && (
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-sm text-slate-600 space-y-2.5">
                  <p className="font-semibold text-slate-800">
                    No profiles match these filters in {reviewTab} tab.
                  </p>
                  {candidates.some(c => reviewStatus(c) === reviewTab) && (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-slate-500">
                        {candidates.filter(c => reviewStatus(c) === reviewTab).length} profile(s) available in {reviewTab}:
                      </span>
                      {candidates.some(c => reviewStatus(c) === reviewTab && c.reviewState === 'Needs Review') && assessmentFilter !== 'Needs Review' && (
                        <button
                          type="button"
                          onClick={() => setAssessmentFilter('Needs Review')}
                          className="px-2.5 py-1 rounded-md bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold transition cursor-pointer"
                        >
                          Show Needs Verification ({candidates.filter(c => reviewStatus(c) === reviewTab && c.reviewState === 'Needs Review').length})
                        </button>
                      )}
                      {candidates.some(c => reviewStatus(c) === reviewTab && c.reviewState === 'Matched') && assessmentFilter !== 'Matched' && (
                        <button
                          type="button"
                          onClick={() => setAssessmentFilter('Matched')}
                          className="px-2.5 py-1 rounded-md bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-bold transition cursor-pointer"
                        >
                          Show Qualified ({candidates.filter(c => reviewStatus(c) === reviewTab && c.reviewState === 'Matched').length})
                        </button>
                      )}
                      {(assessmentFilter !== 'All' || typeFilter !== 'All' || platformFilter !== 'All' || !!locationFilter) && (
                        <button
                          type="button"
                          onClick={() => { setAssessmentFilter('All'); setTypeFilter('All'); setPlatformFilter('All'); setLocationFilter(''); }}
                          className="px-2.5 py-1 rounded-md bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold transition cursor-pointer"
                        >
                          Show All Assessments ({candidates.filter(c => reviewStatus(c) === reviewTab).length})
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
              {candidates.filter(c => reviewStatus(c) === reviewTab && matchesFilters(c)).map((candidate) => {
                const isSelected = selectedUsernames.has(candidate.candidateId);
                const edit = getCandidateEdit(candidate);
                const expected = getExpectedClassification();
                const blockers = candidateApprovalBlockers(candidate);
                const readyToApprove = blockers.length === 0;
                const isApproved = reviewStatus(candidate) === "Approved";
                const isRejected = reviewStatus(candidate) === "Rejected";
                const isPending = reviewStatus(candidate) === "Pending";
                const isNeedsReview = candidate.reviewState === "Needs Review";
                const isMatched = candidate.reviewState === "Matched";
                const isEditorOpen = isNeedsReview || expandedEdits.has(candidate.candidateId) || Boolean(candidate.entityAssessment && isPending);

                return (
                  <div
                    key={candidate.candidateId}
                    className={`rounded-2xl border p-3.5 sm:p-4 transition-all flex flex-col gap-3.5 ${
                      isSelected
                        ? "border-indigo-500 bg-indigo-50/20 shadow-xs ring-1 ring-indigo-500/20"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    {/* Top Row: Basic Identity, Link, Bio & Metrics */}
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      {/* Left: Checkbox + Avatar + Profile Details */}
                      <div className="flex items-start space-x-3.5 flex-1 min-w-0">
                        {/* Checkbox (allows selecting for batch approve / import) */}
                        <button
                          type="button"
                          aria-label={`Select ${candidate.name}`}
                          aria-pressed={isSelected}
                          disabled={importing || savingReview}
                          onClick={() => toggleCandidate(candidate.candidateId)}
                          className="mt-1 text-indigo-600 hover:text-indigo-700 transition shrink-0 cursor-pointer disabled:opacity-40"
                          title={isSelected ? "Deselect candidate" : "Select candidate"}
                        >
                          {isSelected ? (
                            <CheckSquare className="w-5 h-5 text-indigo-600" />
                          ) : (
                            <Square className="w-5 h-5 text-slate-300 hover:text-slate-400" />
                          )}
                        </button>

                        {/* Avatar */}
                        <div className="shrink-0">
                          {candidate.avatarUrl ? (
                            <img
                              src={candidate.avatarUrl}
                              alt={candidate.name}
                              className="w-11 h-11 rounded-full object-cover border border-slate-200"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = "none";
                              }}
                            />
                          ) : (
                            <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 text-white font-black flex items-center justify-center text-sm shadow-inner">
                              {(candidate.name || candidate.username).charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>

                        {/* Name, Handle, Badges, Link & Bio */}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <h4 className="font-extrabold text-sm text-slate-900 truncate">
                              {candidate.name}
                            </h4>
                            <span className="text-xs text-slate-500 font-mono truncate" title={candidate.username}>
                              @{candidate.username}
                            </span>

                            {/* CRM Status Badge */}
                            {candidate.isExisting ? (
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                <UserCheck className="w-3 h-3" />
                                <span>Already in CRM</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <UserPlus className="w-3 h-3" />
                                <span>New Candidate</span>
                              </span>
                            )}

                            {/* Review Decision Badge */}
                            {isApproved && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white">
                                Approved
                              </span>
                            )}
                            {isRejected && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-600 text-white">
                                Rejected
                              </span>
                            )}
                            {isPending && isNeedsReview && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                Needs Review
                              </span>
                            )}
                          </div>

                          {/* Clickable Profile Link */}
                          <div className="mt-1">
                            <a
                              href={candidate.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex max-w-full items-center space-x-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
                              title={`Open live profile on ${candidate.platform}`}
                            >
                              <span className="min-w-0 truncate max-w-[280px] sm:max-w-md">
                                {candidate.url}
                              </span>
                              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                            </a>
                          </div>

                          {/* Bio snippet */}
                          {candidate.bio && (
                            <p className="text-xs text-slate-600 mt-1.5 line-clamp-2 leading-relaxed">
                              {candidate.bio}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Right: Metrics Chips */}
                      <div className="flex sm:flex-col items-end sm:items-end justify-between sm:justify-center shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100 gap-1 pl-8 sm:pl-0">
                        <div className="flex items-center space-x-1.5 text-xs font-extrabold text-slate-800">
                          <Users className="w-3.5 h-3.5 text-slate-400" />
                          <span>{(sizeCriteria.sizeMetric==='members'?candidate.members:candidate.followers) == null ? "Unknown" : formatNumber((sizeCriteria.sizeMetric==='members'?candidate.members:candidate.followers)!)}</span>
                          <span className="text-[10px] text-slate-500 font-normal">{sizeCriteria.sizeMetric==='members'?'members':'followers'}</span>
                        </div>
                        <div className="flex items-center space-x-2 text-[11px] text-slate-500 font-semibold">
                          <span className="text-indigo-600 font-bold">
                            {candidate.er === null ? "Unknown ER" : `${candidate.er.toFixed(1)}% ER`}
                          </span>
                          {candidate.avgViews !== null && (
                            <span>• {formatNumber(candidate.avgViews)} avg</span>
                          )}
                        </div>
                        {candidate.posts && candidate.posts.length > 0 && (
                          <span className="text-[10px] text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded font-medium">
                            {candidate.posts.length} posts ready
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Bottom Review & Verification Area */}
                    <div className="pt-3 border-t border-slate-100 space-y-2.5" onClick={(e) => e.stopPropagation()}>
                      {/* Meta Signals & Reasons */}
                      <div className="flex flex-wrap items-center justify-between text-xs gap-2">
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className="font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                            {t(candidate.platform)}
                          </span>
                          <span className="text-slate-400">·</span>
                          <span className="text-slate-600">
                            Assessment: <strong className="text-slate-800">{t(candidate.reviewState)}</strong>
                          </span>
                          {candidate.reasons.length > 0 && (
                            <>
                              <span className="text-slate-400">·</span>
                              <span className="text-slate-600 truncate max-w-[280px] sm:max-w-md" title={candidate.reasons.join(" · ")}>
                                {candidate.reasons.join(" · ")}
                              </span>
                            </>
                          )}
                        </div>

                        {/* Toggle Editor for Matched Profiles */}
                        {isMatched && isPending && (
                          <button
                            type="button"
                            onClick={() => toggleEditExpanded(candidate.candidateId)}
                            className="inline-flex items-center space-x-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 transition cursor-pointer"
                          >
                            <SlidersHorizontal className="w-3 h-3" />
                            <span>{expandedEdits.has(candidate.candidateId) ? "Hide Edit Options" : "Edit Profile Attributes"}</span>
                          </button>
                        )}
                      </div>

                      {/* Evidence Accordion if available (only show when entityAssessment is not present to avoid duplicate panels) */}
                      {!candidate.entityAssessment && candidate.evidence.length > 0 && (
                        <details className="text-xs text-slate-600 rounded-lg bg-slate-50/80 p-2 border border-slate-200/60">
                          <summary className="font-semibold text-slate-700 cursor-pointer select-none">
                            Profile evidence signals ({candidate.evidence.length})
                          </summary>
                          <div className="mt-1 space-y-0.5 font-mono text-[11px] text-slate-600">
                            {candidate.evidence.map((line, i) => (
                              <p key={i}>{line}</p>
                            ))}
                          </div>
                        </details>
                      )}

                      {/* Editable Verification & Classification Box */}
                      {isEditorOpen && (
                        <div
                          role="region"
                          aria-label="Account evidence"
                          className={`p-3 sm:p-3.5 rounded-xl border transition-all space-y-2.5 ${
                            isNeedsReview
                              ? "bg-amber-50/30 border-amber-200/90 shadow-2xs"
                              : "bg-slate-50 border-slate-200 shadow-2xs"
                          }`}
                        >
                          {/* Box Header */}
                          <div className="flex items-center justify-between pb-2 border-b border-slate-200/70">
                            <div className="flex items-center gap-1.5">
                              <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-600" />
                              <span className="text-xs font-bold text-slate-800">
                                {isNeedsReview ? "Review & Edit Profile Attributes" : "Candidate Attributes"}
                              </span>
                              {isNeedsReview && (
                                <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-200">
                                  Verification Needed
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-500">
                              Target: <strong className="text-slate-700">{expected === "Community" ? "Community / Club" : "Individual Creator"}</strong>
                            </span>
                          </div>

                          {/* 3-Column Responsive Selectors */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            {/* Field 1: Entity / Profile Type */}
                            {candidate.entityAssessment ? (
                              <div className="space-y-1">
                                <label className="block text-[11px] font-bold text-slate-700">
                                  Correct account type
                                </label>
                                <div className="flex items-center gap-1.5">
                                  <select
                                    disabled={savingReview || importing || isApproved}
                                    aria-label={`Correct account type for ${candidate.name}`}
                                    value={typeDrafts[candidate.candidateId] || candidate.entityAssessment.reviewedType || candidate.entityAssessment.suggestedType || 'Unknown'}
                                    onChange={(e) => {
                                      const val = e.target.value as EntityType;
                                      setTypeDrafts(prev => ({ ...prev, [candidate.candidateId]: val }));
                                    }}
                                    className="w-full text-xs font-semibold rounded-lg border border-slate-300 px-2.5 py-1.5 transition bg-white shadow-2xs focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100"
                                  >
                                    {ENTITY_TYPES.map(val => (
                                      <option key={val} value={val}>{t(val)}</option>
                                    ))}
                                  </select>
                                  <button
                                    type="button"
                                    disabled={savingReview || importing || isApproved}
                                    onClick={() => {
                                      const val = typeDrafts[candidate.candidateId] || candidate.entityAssessment?.reviewedType || candidate.entityAssessment?.suggestedType || 'Unknown';
                                      void handleFeedbackAndReject(candidate, 'Wrong Entity Type', undefined, val);
                                    }}
                                    className="shrink-0 px-2.5 py-1.5 text-[11px] font-bold rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 transition disabled:opacity-40 cursor-pointer shadow-2xs"
                                  >
                                    Save type correction
                                  </button>
                                </div>
                                <div className="text-[10px] space-y-0.5">
                                  <div className="flex flex-wrap items-center gap-1 text-slate-500">
                                    <span>Suggested: <strong>{t(candidate.entityAssessment.suggestedType)}</strong></span>
                                    <span>·</span>
                                    <span>Reviewed type: <strong>{t(candidate.entityAssessment.reviewedType || 'Not reviewed')}</strong></span>
                                  </div>
                                  {typeDrafts[candidate.candidateId] && typeDrafts[candidate.candidateId] !== (candidate.entityAssessment.reviewedType || candidate.entityAssessment.suggestedType) && (
                                    <span className="text-amber-700 font-medium block">
                                      Unsaved account type. Save the correction before approving.
                                    </span>
                                  )}
                                  {!['Individual', 'Community', 'Club', 'Unknown'].includes(typeDrafts[candidate.candidateId] || candidate.entityAssessment.suggestedType) && (
                                    <span className="text-red-600 font-medium block">
                                      This type is retained for Scout review and cannot be imported into the current CRM.
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <label className="block text-[11px] font-bold text-slate-700">
                                  Entity Type
                                </label>
                                <select
                                  disabled={savingReview || importing || isApproved}
                                  value={edit.classification}
                                  onChange={(e) => updateCandidateEdit(candidate.candidateId, candidate, { classification: e.target.value as CandidateClassification })}
                                  className={`w-full text-xs font-medium rounded-lg border px-2.5 py-1.5 transition bg-white shadow-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 ${
                                    edit.classification === expected
                                      ? "border-emerald-300 text-slate-900"
                                      : edit.classification === "Unknown"
                                      ? "border-amber-300 text-amber-900"
                                      : "border-red-300 text-red-900"
                                  }`}
                                >
                                  <option value="Individual">Individual Creator</option>
                                  <option value="Community">Community / Fanpage / Club</option>
                                  <option value="Brand/Business">Brand / Business / Shop</option>
                                  <option value="Unknown">Unknown / Unclassified</option>
                                </select>
                                <div className="text-[10px]">
                                  {edit.classification === expected ? (
                                    <span className="text-emerald-700 font-semibold flex items-center gap-1">
                                      <Check className="w-3 h-3 text-emerald-600 shrink-0" /> Matches target type
                                    </span>
                                  ) : edit.classification === "Unknown" ? (
                                    <span className="text-amber-700 font-medium flex items-center gap-1">
                                      <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" /> Select entity type
                                    </span>
                                  ) : (
                                    <span className="text-red-600 font-medium flex items-center gap-1">
                                      <X className="w-3 h-3 text-red-600 shrink-0" /> Does not match target
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Field 2: Topic Relevance */}
                            <div className="space-y-1">
                              <label className="block text-[11px] font-bold text-slate-700">
                                Topic Relevance
                              </label>
                              <select
                                disabled={savingReview || importing || isApproved}
                                aria-label={`Topic relevance for ${candidate.name}`}
                                value={edit.relevant === undefined ? "unknown" : edit.relevant ? "true" : "false"}
                                onChange={(e) => updateCandidateEdit(candidate.candidateId, candidate, { relevant: e.target.value === "unknown" ? undefined : e.target.value === "true" })}
                                className={`w-full text-xs font-medium rounded-lg border px-2.5 py-1.5 transition bg-white shadow-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 ${
                                  edit.relevant ? "border-emerald-300 text-slate-900" : edit.relevant === undefined ? "border-amber-300 text-amber-900" : "border-red-300 text-red-900"
                                }`}
                              >
                                <option value="true">Matches Topic ({effectiveQuery || keyword.trim() || "Topic"})</option>
                                <option value="unknown">Needs Topic Verification</option>
                                <option value="false">Off-Topic / Irrelevant</option>
                              </select>
                              <div className="text-[10px]">
                                {edit.relevant ? (
                                  <span className="text-emerald-700 font-semibold flex items-center gap-1">
                                    <Check className="w-3 h-3 text-emerald-600 shrink-0" /> Relevant content
                                  </span>
                                ) : edit.relevant === undefined ? (
                                  <span className="text-amber-700">Insufficient topic evidence; not marked off-topic</span>
                                ) : (
                                  <span className="text-red-600 font-medium flex items-center gap-1">
                                    <X className="w-3 h-3 text-red-600 shrink-0" /> Marked off-topic
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Field 3: Target Location */}
                            <div className="space-y-1">
                              <label className="block text-[11px] font-bold text-slate-700">
                                Target Location
                              </label>
                              <select
                                disabled={savingReview || importing || isApproved}
                                aria-label={`Target location for ${candidate.name}`}
                                value={edit.locationConfirmed === undefined ? "unknown" : edit.locationConfirmed ? "true" : "false"}
                                onChange={(e) => updateCandidateEdit(candidate.candidateId, candidate, { locationConfirmed: e.target.value === "unknown" ? undefined : e.target.value === "true" })}
                                className={`w-full text-xs font-medium rounded-lg border px-2.5 py-1.5 transition bg-white shadow-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 ${
                                  edit.locationConfirmed ? "border-emerald-300 text-slate-900" : "border-amber-300 text-amber-900"
                                }`}
                              >
                                <option value="true">Matches Location ({geography})</option>
                                <option value="unknown">Needs Location Verification</option>
                                <option value="false">Wrong Location / Outside Area</option>
                              </select>
                              <div className="text-[10px]">
                                {edit.locationConfirmed ? (
                                  <span className="text-emerald-700 font-semibold flex items-center gap-1">
                                    <Check className="w-3 h-3 text-emerald-600 shrink-0" /> Location confirmed
                                  </span>
                                ) : edit.locationConfirmed === false ? (
                                  <span className="text-red-600 font-medium">Location does not match the target</span>
                                ) : (
                                  <span className="text-amber-700 font-medium flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3 text-amber-600 shrink-0" /> Location unverified
                                  </span>
                                )}
                                {candidate.geographyAssessment?.reason && (
                                  <p className="text-slate-500 text-[10px] mt-0.5 leading-tight">{candidate.geographyAssessment.reason}</p>
                                )}
                              </div>
                            </div>
                          </div>

                          {candidate.assessmentVersion===7 && (
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/70 text-xs">
                              <p className="text-[11px] text-slate-500 leading-snug">
                                Your corrections are saved as team review, separately from provider observations. Audience size requirements still apply.
                              </p>
                              <div className="flex flex-wrap items-center gap-2">
                                {candidate.manualAttributeReview && (
                                  <span className="text-[10px] text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded font-mono">
                                    Team review saved: {candidate.manualAttributeReview.confirmedAt}
                                  </span>
                                )}
                                <button
                                  type="button"
                                  disabled={savingReview || importing || isApproved || !attributesChanged(candidate)}
                                  onClick={()=>void saveAttributes(candidate)}
                                  className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-1.5 text-xs transition shadow-2xs disabled:opacity-40 cursor-pointer"
                                >
                                  Save topic and location
                                </button>
                              </div>
                            </div>
                          )}
                          {/* Quick Action Alerts if Mismatched */}
                          {!candidate.entityAssessment && edit.classification !== expected && edit.classification !== "Unknown" && (
                            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs">
                              <div className="text-amber-800">
                                Classified as <strong>{t(edit.classification)}</strong>. Cannot be imported as <strong>{expected === "Community" ? "Community" : "Individual Creator"}</strong>.
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={savingReview || importing}
                                  onClick={() => updateCandidateEdit(candidate.candidateId, candidate, { classification: expected })}
                                  className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-[11px] transition shadow-xs cursor-pointer"
                                >
                                  Confirm as {expected === "Community" ? "Community" : "Individual Creator"}
                                </button>
                                <button
                                  type="button"
                                  disabled={savingReview || importing}
                                  onClick={() => handleFeedbackAndReject(candidate, "Wrong Entity Type", edit.classification)}
                                  className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white font-semibold text-[11px] transition shadow-xs cursor-pointer"
                                >
                                  Reject & Flag as {t(edit.classification)}
                                </button>
                              </div>
                            </div>
                          )}

                          {edit.relevant === false && (
                            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs">
                              <div className="text-red-800">
                                Profile content is marked as off-topic for this search.
                              </div>
                              <button
                                type="button"
                                disabled={savingReview || importing}
                                onClick={() => handleFeedbackAndReject(candidate, "Not Relevant")}
                                className="px-2.5 py-1 rounded bg-red-600 hover:bg-red-700 text-white font-semibold text-[11px] transition shadow-xs cursor-pointer"
                              >
                                Reject as Off-Topic
                              </button>
                            </div>
                          )}

                          {candidate.assessmentVersion!==7 && !edit.locationConfirmed && isNeedsReview && edit.classification === expected && edit.relevant && (
                            <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-lg bg-slate-100 text-slate-700 text-[11px]">
                              <span>Confirm whether candidate operates in <strong>{geography}</strong> to approve.</span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={savingReview || importing}
                                  onClick={() => updateCandidateEdit(candidate.candidateId, candidate, { locationConfirmed: true })}
                                  className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[10px] transition cursor-pointer"
                                >
                                  Confirm Location ({geography})
                                </button>
                                <button
                                  type="button"
                                  disabled={savingReview || importing}
                                  onClick={() => handleFeedbackAndReject(candidate, "Wrong Location")}
                                  className="px-2 py-0.5 rounded bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold text-[10px] transition cursor-pointer"
                                >
                                  Reject (Wrong Location)
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {isPending && blockers.length > 0 && (
                        <div
                          id={`approval-blockers-${candidate.candidateId}`}
                          role="note"
                          className="rounded-xl border border-amber-200 bg-amber-50/80 p-2.5 text-xs text-amber-900 space-y-1"
                        >
                          <p className="font-bold flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>Approval is blocked</span>
                          </p>
                          <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-amber-800">
                            {blockers.map((reason) => (
                              <li key={reason}>{reason}</li>
                            ))}
                          </ul>
                          {candidate.assessmentVersion === 7 && (
                            <p className="text-[10px] text-amber-700 pt-0.5">
                              You can correct topic and location above, then save your team review. Audience size and account type must still meet the selected criteria.
                            </p>
                          )}
                        </div>
                      )}
                      {/* Action Buttons Row */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {isPending && (
                            <button
                              type="button"
                              disabled={savingReview || importing || !readyToApprove}
                              onClick={() => saveReview(candidate, "approved")}
                              className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center space-x-1.5 cursor-pointer"
                              aria-describedby={!readyToApprove ? `approval-blockers-${candidate.candidateId}` : undefined}
                              title={!readyToApprove ? blockers.join(' ') : 'Approve candidate for import'}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Approve for Import</span>
                            </button>
                          )}

                          {!isRejected && (
                            <button
                              type="button"
                              disabled={savingReview || importing}
                              onClick={() => saveReview(candidate, "rejected")}
                              className="rounded-lg border border-red-200 hover:bg-red-50 text-red-700 px-3 py-2 text-xs font-semibold transition disabled:opacity-50 cursor-pointer"
                            >
                              Reject
                            </button>
                          )}

                          {!isPending && (
                            <button
                              type="button"
                              disabled={savingReview || importing}
                              onClick={() => saveReview(candidate, "pending")}
                              className="rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 px-3 py-2 text-xs font-semibold transition disabled:opacity-50 cursor-pointer"
                            >
                              Return to Review
                            </button>
                          )}
                        </div>

                        {/* Feedback Dropdown */}
                        <div className="w-full sm:w-auto">
                          <select
                            disabled={savingReview || importing}
                            aria-label="Scout feedback"
                            defaultValue=""
                            className="w-full sm:w-auto text-[11px] font-medium text-slate-600 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 hover:border-slate-300 focus:outline-none cursor-pointer"
                            onChange={async (e) => {
                              const value = e.target.value;
                              if (!value) return;
                              const [reason, classification] = value.split("|");
                              await handleFeedbackAndReject(candidate, reason, classification);
                              e.target.value = "";
                            }}
                          >
                            <option value="">More Feedback Options...</option>
                            <option value="Not Relevant">Report Not Relevant</option>
                            <option value="Wrong Location">Report Wrong Location</option>
                            {!candidate.entityAssessment && <><option value="Wrong Entity Type|Individual">Report as Individual Creator</option>
                            <option value="Wrong Entity Type|Community">Report as Community / Fanpage</option>
                            <option value="Wrong Entity Type|Brand/Business">Report as Brand / Business</option>
                            <option value={`Correct Classification|${candidate.classification}`}>Confirm Original Heuristic</option></>}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Importing Progress Banner */}
            {importing && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-3.5 flex items-center space-x-3 text-xs text-indigo-900 animate-pulse shrink-0">
                <RefreshCw className="w-5 h-5 text-indigo-600 animate-spin shrink-0" />
                <div>
                  <p className="font-bold">Ingesting Selected Profiles into Database...</p>
                  <p className="text-[11px] text-indigo-700 mt-0.5 leading-relaxed">
                    Saving verified profiles and deduplicating with existing CRM records.
                  </p>
                </div>
              </div>
            )}


          </div>
        )}
    </ScoutDialogFrame>
  );
}
