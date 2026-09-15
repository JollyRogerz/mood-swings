import React, { useEffect, useState } from "react";
import { X, Copy, Check, Share2, QrCode } from "lucide-react";

export function inviteURL(origin: string, code: string) {
  return `${origin}/room/${code}`;
}
export function InviteDialog({
  code,
  close,
}: {
  code: string;
  close: () => void;
}) {
  const url = inviteURL(location.origin, code);
  const [qr, setQR] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let live = true;
    import("qrcode")
      .then((q) =>
        q.toDataURL(url, { width: 280, margin: 4, errorCorrectionLevel: "M" }),
      )
      .then((image) => {
        if (live) setQR(image);
      })
      .catch(() => {
        if (live)
          setMessage(
            "The QR code couldn’t load. You can still copy the invite link.",
          );
      });
    return () => {
      live = false;
    };
  }, [url]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setMessage("Invite link copied.");
    } catch {
      setCopied(false);
      setMessage("Select the link above and copy it to share your table.");
    }
  }
  async function share() {
    try {
      await navigator.share({
        title: "Join my Mood Swings table",
        text: "Pull up a chair — let’s play Mood Swings!",
        url,
      });
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        setMessage("Sharing couldn’t open. Copy the link instead.");
    }
  }
  return (
    <div className="modal-backdrop invite-backdrop" onClick={close}>
      <section
        className="invite-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Invite friends"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="close-modal"
          data-dialog-close
          onClick={close}
          aria-label="Close invite"
        >
          <X />
        </button>
        <span className="eyebrow">GOOD COMPANY STARTS HERE</span>
        <h2>Pull up a chair.</h2>
        <p>Scan this code with your phone’s camera to join the table.</p>
        <div className="invite-qr">
          {qr ? (
            <img src={qr} alt={`QR code to join room ${code}`} />
          ) : (
            <QrCode size={48} aria-label="Loading QR code" />
          )}
        </div>
        <strong className="invite-room-code">{code}</strong>
        <label className="invite-link">
          Invite link
          <input
            aria-label="Invite link"
            readOnly
            value={url}
            onFocus={(e) => e.target.select()}
          />
        </label>
        <div className="invite-actions">
          {typeof navigator.share === "function" && (
            <button className="primary" onClick={share}>
              <Share2 size={17} /> Share invite
            </button>
          )}
          <button className="primary" onClick={copy}>
            {copied ? <Check size={17} /> : <Copy size={17} />}{" "}
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
        <p role="status" className="invite-message">
          {message ||
            "Send the link to your friends, or let them scan your screen."}
        </p>
      </section>
    </div>
  );
}
