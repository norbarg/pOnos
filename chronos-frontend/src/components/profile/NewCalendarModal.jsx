// chronos-frontend/src/components/profile/NewCalendarModal.jsx
import { useEffect, useMemo, useState, useRef } from "react";
import { api } from "../../api/axios";
import "./newCalendarModal.css";

const PALETTE = [
  "#A7BBEE", "#D86497", "#D8AC89", "#C5BDF0",
  "#96C0BE", "#D65050", "#F9F06C", "#59DAEB",
];

const NAME_MIN = 1;           
const DESC_MIN = 1;           

export default function NewCalendarModal({
  open,
  onClose,
  onCreated,
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(PALETTE[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      document.body.classList.add("modal-open");
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      document.body.classList.remove("modal-open");
      setName(""); setDescription(""); setError(""); setLoading(false);
      setColor(PALETTE[0]);
    }
    return () => document.body.classList.remove("modal-open");
  }, [open]);

  const canSubmit = useMemo(() => {
    return (
      name.trim().length >= NAME_MIN &&
      description.trim().length >= DESC_MIN &&
      !loading
    );
  }, [name, description, loading]);                 

  function onOverlay(e) {
    if (e.target === e.currentTarget && !loading) onClose?.();
  }

  function onKey(e) {
    if (e.key === "Escape" && !loading) onClose?.();
  }

  async function submit() {
    const nm = name.trim();                          
    const ds = description.trim();                   
    if (nm.length < NAME_MIN || ds.length < DESC_MIN) {
      setError(
        nm.length < NAME_MIN
          ? `Title is required (min ${NAME_MIN} chars).`
          : `Description is required (min ${DESC_MIN} chars).`
      );
      return;
    }                                                

    setLoading(true);
    setError("");
    try {
      const { data } = await api.post("/calendars", {
        name: nm,
        description: ds,         
        color,
      });
      const created = data?.calendar;
      onCreated?.(created);
      onClose?.();
    } catch (err) {
      const code = err?.response?.status;
      const msg = err?.response?.data?.error || "failed";
      if (code === 409 || msg === "duplicate-name") {
        setError("You already have a calendar with this name.");
      } else if (code === 400 && (msg === "name-required" || msg === "description-required")) {
        setError(
          msg === "name-required"
            ? "Title is required."
            : "Description is required."
        );
      } else {
        setError("Failed to create calendar. Try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="nc-overlay" onMouseDown={onOverlay} onKeyDown={onKey} role="dialog" aria-modal="true">
      <div className="nc-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="nc-head">
          <h3 className="nc-title">New calendar</h3>
          <div className="nc-titleInput">
            <span className="nc-caret" aria-hidden="true"></span>
            <input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="> Add title..."
              maxLength={64}
              aria-label="Calendar title"
              required                                        
              aria-invalid={name.trim().length < NAME_MIN}
            />
          </div>
        </div>

        <div className="nc-field">
          <label>Enter calendar description</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add description..."
            rows={3}
            maxLength={300}
            required                                        
            aria-invalid={description.trim().length < DESC_MIN}
          />
        </div>

        <div className="nc-field">
          <label>Select the calendar color</label>
          <div className="nc-swatches">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                className={`nc-swatch${color === c ? " is-active" : ""}`}
                style={{ "--sw": c }}
                onClick={() => setColor(c)}
                aria-label={`choose color ${c}`}
              >
                <span className="nc-dot" />
              </button>
            ))}
          </div>
        </div>
        <div className="ep-hint">
                              Calendar header color
                            </div>
        {error && <div className="nc-error" role="alert">{error}</div>}

        <div className="nc-actions">
          <button className="nc-btn nc-btn--ghost" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className="nc-btn" onClick={submit} disabled={!canSubmit}>
            {loading ? "Creating…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
