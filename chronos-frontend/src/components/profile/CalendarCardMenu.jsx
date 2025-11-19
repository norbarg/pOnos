// chronos-frontend/src/components/profile/CalendarCardMenu.jsx
import { useEffect, useRef } from "react";
import { api } from "../../api/axios";
import "./cardMenu.css";
import icEdit from "../../assets/ic_edit.png";
import icEye from "../../assets/ic_eye.png";
import icEyeOff from "../../assets/ic_eye_off.png";
import icTrash from "../../assets/ic_trash.png";

export default function CalendarCardMenu({
  cal,
  meId,
  onClose,
  onEdited,   
  onRemoved,   
  onLeft    
}) {
  const ref = useRef(null);
  const isOwner = String(cal.owner) === String(meId);
  const canEdit = isOwner && !cal.isSystem;
  const canDelete = isOwner && !cal.isSystem && !cal.isMain;
  const canLeave = !isOwner;

  useEffect(() => {
    function onDoc(e) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target)) onClose?.();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", (e) => e.key === "Escape" && onClose?.());
    return () => {
      document.removeEventListener("mousedown", onDoc);
    };
  }, [onClose]);

  async function toggleActive() {
    const next = !cal.active;
    try {
      const { data } = await api.patch(`/calendars/${cal.id}/status`, { active: next });
      onEdited?.({ ...cal, active: data?.active ?? next });
    } catch {
    } finally { onClose?.(); }
  }

  async function doDelete() {
    if (!canDelete) return;
    if (!window.confirm("Delete this calendar?")) return;
    try {
      await api.delete(`/calendars/${cal.id}`);
      onRemoved?.(cal.id);
    } catch {
    } finally { onClose?.(); }
  }

  async function doLeave() {
    if (!canLeave) return;
    if (!window.confirm("Leave this calendar?")) return;
    try {
      await api.post(`/calendars/${cal.id}/leave`);
      onLeft?.(cal.id);
    } catch {
    } finally { onClose?.(); }
  }

  return (
    <div className="calMenu" ref={ref} onMouseDown={(e)=>e.stopPropagation()}>
      {canEdit && (
        <button className="calMenu__item" onClick={()=>{ onEdited?.({ __openEdit: true, ...cal }); }}>
          <img src={icEdit} alt="" />
          <span>Edit Calendar</span>
        </button>
      )}

      <button className="calMenu__item" onClick={toggleActive}>
        <img src={cal.active ? icEyeOff : icEye} alt="" />
        <span>{cal.active ? "Hide" : "Show"}</span>
      </button>

      {canDelete && (
        <button className="calMenu__item calMenu__item--danger" onClick={doDelete}>
          <img src={icTrash} alt="" />
          <span>Delete</span>
        </button>
      )}

      {canLeave && <div className="calMenu__sep" />}

      {canLeave && (
        <button className="calMenu__leave" onClick={doLeave}>
          Leave
        </button>
      )}
    </div>
  );
}
