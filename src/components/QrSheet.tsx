import { useEffect, useState } from "react";
import { qrDataUrl } from "../utils/qr";
import { Sheet } from "./ui/Sheet";
import { Check, QrCode } from "./ui/icons";

interface QrSheetProps {
  open: boolean;
  onClose: () => void;
}

export function QrSheet({ open, onClose }: QrSheetProps) {
  const [url, setUrl] = useState("");
  const [dataUrl, setDataUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const port = window.location.port ? `:${window.location.port}` : "";
    (async () => {
      let target = window.location.href;
      try {
        const res = await fetch("/api/netinfo");
        if (res.ok) {
          const data = (await res.json()) as { ip?: string | null };
          if (data.ip) {
            target = `http://${data.ip}${port}/`;
          } else {
            setNote("未检测到局域网地址，二维码指向当前页面地址。");
          }
        } else {
          setNote("本地服务未提供地址信息，二维码指向当前页面地址。");
        }
      } catch {
        setNote("本地服务未提供地址信息，二维码指向当前页面地址。");
      }
      if (!alive) return;
      setUrl(target);
      try {
        setDataUrl(await qrDataUrl(target));
      } catch {
        setNote("二维码生成失败，请手动复制下方地址在手机浏览器打开。");
      }
    })();
    return () => {
      alive = false;
    };
  }, [open]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // 剪贴板不可用时忽略
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="手机访问" className="qr-sheet">
      <div className="qr-body">
        <div className="qr-box">
          {dataUrl ? (
            <img className="qr-svg" src={dataUrl} alt="局域网访问二维码" width={260} height={260} />
          ) : (
            <div className="qr-loading">
              <QrCode size={30} />
            </div>
          )}
        </div>
        <div className="qr-url-row">
          <code className="qr-url">{url || "正在生成…"}</code>
          <button className="btn btn-ghost" onClick={() => void copy()} disabled={!url}>
            {copied ? <Check size={14} /> : null}
            {copied ? "已复制" : "复制"}
          </button>
        </div>
        {note && <p className="muted qr-note">{note}</p>}
        <div className="qr-steps">
          <p>1. 手机连接和电脑同一个 WiFi</p>
          <p>2. 用相机或微信扫一扫上面的二维码</p>
          <p>3. 在手机浏览器里打开，即可查看和录入题目</p>
        </div>
        <p className="muted qr-note">
          如果手机打不开，请检查电脑防火墙是否放行了本应用的端口（默认 5173）。
        </p>
      </div>
    </Sheet>
  );
}
