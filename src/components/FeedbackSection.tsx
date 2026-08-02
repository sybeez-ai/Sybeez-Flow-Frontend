/**
 * Profile feedback — compact entry on Account; form opens on click.
 * After submit: success then return to profile (answers never re-shown).
 */

import { useCallback, useEffect, useState } from "react";
import {
  ChevronRight,
  Loader2,
  MessageSquareHeart,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  fetchAdminFeedback,
  fetchFeedbackStatus,
  isFeedbackSubmittedLocal,
  submitFeedback,
  type FeedbackAdminItem,
} from "@/services/feedbackApi";
import { clearFeedbackNudgeNotifications } from "@/services/notificationService";

const FACES = [
  { value: 1, label: "Very unhappy", face: "😞" },
  { value: 2, label: "Unhappy", face: "🙁" },
  { value: 3, label: "Okay", face: "😐" },
  { value: 4, label: "Happy", face: "🙂" },
  { value: 5, label: "Love it", face: "😄" },
] as const;

const CATEGORIES = [
  { value: "bug", label: "Bug / broken" },
  { value: "ux", label: "Hard to use" },
  { value: "feature", label: "Missing feature" },
  { value: "performance", label: "Slow / performance" },
  { value: "general", label: "General" },
] as const;

export default function FeedbackSection() {
  const [loading, setLoading] = useState(true);
  const [hasSubmittedBefore, setHasSubmittedBefore] = useState(isFeedbackSubmittedLocal());
  const [submitCount, setSubmitCount] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<"form" | "success">("form");
  const [sending, setSending] = useState(false);
  const [satisfaction, setSatisfaction] = useState(4);
  const [category, setCategory] = useState("general");
  const [issues, setIssues] = useState("");
  const [improve, setImprove] = useState("");
  const [recommend, setRecommend] = useState(true);
  const [adminItems, setAdminItems] = useState<FeedbackAdminItem[]>([]);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const status = await fetchFeedbackStatus();
      setHasSubmittedBefore(Boolean(status.submitted));
      setSubmitCount(Number(status.count || 0));
      setIsAdmin(status.is_admin);
      if (status.submitted) clearFeedbackNudgeNotifications();
      if (status.is_admin) {
        setAdminLoading(true);
        try {
          setAdminItems(await fetchAdminFeedback());
        } catch {
          setAdminItems([]);
        } finally {
          setAdminLoading(false);
        }
      }
    } catch {
      setHasSubmittedBefore(isFeedbackSubmittedLocal());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const closeForm = () => {
    setOpen(false);
    setPhase("form");
    setIssues("");
    setImprove("");
    setSatisfaction(4);
    setCategory("general");
    setRecommend(true);
  };

  const openForm = () => {
    setPhase("form");
    setOpen(true);
  };

  const returnToProfile = () => {
    closeForm();
  };

  const onSubmit = async () => {
    if (issues.trim().length < 3 || improve.trim().length < 3) {
      toast.error("Please fill in the issue you face and what to improve");
      return;
    }
    setSending(true);
    try {
      await submitFeedback({
        satisfaction,
        issues: issues.trim(),
        improve: improve.trim(),
        category,
        recommend,
      });
      setHasSubmittedBefore(true);
      setSubmitCount((c) => c + 1);
      clearFeedbackNudgeNotifications();
      setPhase("success");
      toast.success("Feedback submitted — thank you");
      if (isAdmin) void load();
      window.setTimeout(() => {
        returnToProfile();
      }, 1600);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Feedback
      </h3>

      {/* Compact profile row — form opens only on click */}
      <button
        type="button"
        onClick={openForm}
        className="w-full flex items-center gap-3 p-4 rounded-xl border text-left transition-colors border-border bg-foreground/5 hover:bg-foreground/[0.07] hover:border-foreground/20"
      >
        <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl ring-1 bg-foreground/10 ring-border">
          <MessageSquareHeart className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {hasSubmittedBefore ? "Send more feedback" : "Share product feedback"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {hasSubmittedBefore
              ? submitCount > 0
                ? `You've sent ${submitCount} response${submitCount === 1 ? "" : "s"} — send another anytime`
                : "Thanks — you can send another response anytime"
              : "Issues you face, satisfaction, and what to improve"}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground flex-none" />
      </button>

      {isAdmin && (
        <button
          type="button"
          onClick={() => setAdminOpen(true)}
          className="w-full flex items-center justify-between gap-3 p-3.5 rounded-xl border border-border bg-foreground/5 hover:bg-foreground/[0.07] text-left text-sm"
        >
          <span className="font-medium">Feedback inbox (admin)</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {adminLoading ? "…" : `${adminItems.length} total`}
          </span>
        </button>
      )}

      {/* Form dialog */}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) closeForm();
          else if (!submitted) setOpen(true);
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto sm:rounded-2xl p-0 gap-0">
          {phase === "success" ? (
            <div className="px-6 py-12 text-center space-y-3">
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" />
              <DialogHeader className="space-y-2">
                <DialogTitle className="text-center text-lg">
                  Submitted successfully
                </DialogTitle>
                <DialogDescription className="text-center">
                  Returning to your profile…
                </DialogDescription>
              </DialogHeader>
              <Button type="button" variant="outline" size="sm" onClick={returnToProfile}>
                Back to profile
              </Button>
            </div>
          ) : (
            <>
              <div className="px-6 pt-6 pb-4 border-b border-border/60 pr-12">
                <DialogHeader className="space-y-1.5 text-left">
                  <DialogTitle className="flex items-center gap-2 text-base">
                    <MessageSquareHeart className="h-5 w-5" />
                    Product feedback
                  </DialogTitle>
                  <DialogDescription>
                    One submission per account. After you send it, you won’t see
                    the answers again.
                  </DialogDescription>
                </DialogHeader>
              </div>

              <div className="px-6 py-5 space-y-5">
                <div>
                  <p className="text-sm font-medium mb-3">How satisfied are you?</p>
                  <div className="flex flex-wrap gap-2">
                    {FACES.map((f) => (
                      <button
                        key={f.value}
                        type="button"
                        onClick={() => setSatisfaction(f.value)}
                        className={`flex flex-col items-center gap-1 rounded-xl px-3 py-2.5 min-w-[64px] border transition-all ${
                          satisfaction === f.value
                            ? "border-foreground bg-foreground text-background"
                            : "border-border bg-background hover:border-foreground/30"
                        }`}
                        title={f.label}
                      >
                        <span className="text-2xl leading-none">{f.face}</span>
                        <span className="text-[10px] opacity-80">{f.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium mb-2">What kind of feedback?</p>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIES.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => setCategory(c.value)}
                        className={`rounded-full px-3 py-1.5 text-xs border transition-colors ${
                          category === c.value
                            ? "border-foreground bg-foreground text-background"
                            : "border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="block space-y-2">
                  <span className="text-sm font-medium">Issue you face</span>
                  <Textarea
                    value={issues}
                    onChange={(e) => setIssues(e.target.value)}
                    placeholder="What’s frustrating or broken for you right now?"
                    rows={3}
                    className="bg-background resize-none"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium">What should we improve?</span>
                  <Textarea
                    value={improve}
                    onChange={(e) => setImprove(e.target.value)}
                    placeholder="Features, clarity, speed, design — what would make Sybeez better?"
                    rows={3}
                    className="bg-background resize-none"
                  />
                </label>

                <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Would you recommend Sybeez?</p>
                    <p className="text-xs text-muted-foreground">Optional pulse check</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={recommend ? "default" : "outline"}
                      onClick={() => setRecommend(true)}
                    >
                      Yes
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={!recommend ? "default" : "outline"}
                      onClick={() => setRecommend(false)}
                    >
                      Not yet
                    </Button>
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={closeForm}
                    disabled={sending}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    className="flex-1 gap-2"
                    disabled={sending}
                    onClick={() => void onSubmit()}
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    {sending ? "Submitting…" : "Submit feedback"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Admin inbox dialog */}
      <Dialog open={adminOpen} onOpenChange={setAdminOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle>Feedback inbox</DialogTitle>
            <DialogDescription>Admin only — all user submissions</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void load()}
              disabled={adminLoading}
            >
              {adminLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Refresh"}
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">
            {adminItems.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No feedback yet.</p>
            ) : (
              adminItems.map((item) => {
                const face =
                  FACES.find((f) => f.value === item.satisfaction)?.face || "·";
                return (
                  <div
                    key={item.id}
                    className="rounded-xl border border-border bg-background p-4 space-y-2 text-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">
                          {item.user_name || "User"}{" "}
                          <span className="text-muted-foreground font-normal">
                            · {item.user_email}
                          </span>
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {item.created_at
                            ? new Date(item.created_at).toLocaleString()
                            : ""}{" "}
                          · {item.category}
                          {item.recommend ? " · recommends" : " · not yet"}
                        </p>
                      </div>
                      <span className="text-xl">{face}</span>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Issue
                      </p>
                      <p className="whitespace-pre-wrap">{item.issues}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Improve
                      </p>
                      <p className="whitespace-pre-wrap">{item.improve}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
