"use client";
/**
 * ExportImportPanel
 *
 * A self-contained panel with two tabs:
 *   - Export: download a full backup .zip (cloud and/or local)
 *   - Import: upload a .zip bundle and receive an import summary
 *
 * Follow DESIGN.md conventions (MUI v6, no Tailwind/Radix/etc.).
 */

import React, { useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  List,
  ListItem,
  ListItemText,
  Paper,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import {
  CloudDownload,
  CloudUpload,
  Download,
  ErrorOutline,
  InfoOutlined,
  UploadFile,
  WarningAmber,
} from "@mui/icons-material";
import { useDispatch, useSelector } from "@/store";
import {
  exportCloudBackup,
  exportLocalBackup,
  importCloudBackup,
  importLocalBackup,
} from "@/store/thunks/exportThunks";
import type { ImportSummary } from "@/lib/export/manifest";

// ─── Tab panel helper ─────────────────────────────────────────────────────────

function TabPanel({
  children,
  value,
  index,
}: {
  children: React.ReactNode;
  value: number;
  index: number;
}) {
  return (
    <Box
      role="tabpanel"
      hidden={value !== index}
      id={`export-import-tabpanel-${index}`}
      aria-labelledby={`export-import-tab-${index}`}
      sx={{ pt: 3 }}
    >
      {value === index && children}
    </Box>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export const ExportImportPanel: React.FC = () => {
  const [tab, setTab] = useState(0);

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, borderRadius: 2 }}>
      <Typography variant="h6" gutterBottom>
        Backup &amp; Restore
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Export all your documents (with full revision history and assets) to a
        {" "}
        <code>.zip</code> file, or restore from a previous backup.
      </Typography>

      <Tabs
        value={tab}
        onChange={(_, v) =>
          setTab(v)}
        aria-label="Export / Import tabs"
        sx={{ borderBottom: 1, borderColor: "divider" }}
      >
        <Tab
          icon={<Download fontSize="small" />}
          iconPosition="start"
          label="Export"
          id="export-import-tab-0"
          aria-controls="export-import-tabpanel-0"
        />
        <Tab
          icon={<UploadFile fontSize="small" />}
          iconPosition="start"
          label="Import"
          id="export-import-tab-1"
          aria-controls="export-import-tabpanel-1"
        />
      </Tabs>

      <TabPanel value={tab} index={0}>
        <ExportTab />
      </TabPanel>
      <TabPanel value={tab} index={1}>
        <ImportTab />
      </TabPanel>
    </Paper>
  );
};

// ─── Export tab ───────────────────────────────────────────────────────────────

const ExportTab: React.FC = () => {
  const dispatch = useDispatch();
  const user = useSelector((s) => s.user);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [localLoading, setLocalLoading] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [localWarnings, setLocalWarnings] = useState<string[]>([]);
  const [cloudSuccess, setCloudSuccess] = useState<string | null>(null);
  const [localSuccess, setLocalSuccess] = useState<string | null>(null);

  const handleCloudExport = async () => {
    setCloudError(null);
    setCloudSuccess(null);
    setCloudLoading(true);
    const result = await dispatch(exportCloudBackup());
    setCloudLoading(false);
    if (exportCloudBackup.rejected.match(result)) {
      const payload = result.payload as
        | { title: string; subtitle?: string }
        | undefined;
      setCloudError(payload?.subtitle ?? payload?.title ?? "Export failed");
    } else {
      const payload = result.payload as { filename: string } | undefined;
      setCloudSuccess(`Downloaded: ${payload?.filename ?? "backup.zip"}`);
    }
  };

  const handleLocalExport = async () => {
    setLocalWarnings([]);
    setLocalSuccess(null);
    setLocalLoading(true);
    const result = await dispatch(exportLocalBackup());
    setLocalLoading(false);
    if (exportLocalBackup.rejected.match(result)) {
      const payload = result.payload as
        | { title: string; subtitle?: string }
        | undefined;
      setLocalWarnings([
        payload?.subtitle ?? payload?.title ?? "Export failed",
      ]);
    } else {
      const payload = result.payload as {
        filename: string;
        documents: number;
        warnings: string[];
      } | undefined;
      setLocalSuccess(
        `Downloaded: ${payload?.filename ?? "local-backup.zip"} (${
          payload?.documents ?? 0
        } documents)`,
      );
      setLocalWarnings(payload?.warnings ?? []);
    }
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {/* Cloud export */}
      <Box>
        <Typography variant="subtitle1" gutterBottom>
          Cloud backup
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Downloads all your saved cloud documents, series, revision history,
          and uploaded files as a single <code>.zip</code> archive.
        </Typography>
        {!user && (
          <Alert severity="info" sx={{ mb: 1.5 }} icon={<InfoOutlined />}>
            Sign in to export cloud documents.
          </Alert>
        )}
        <Button
          variant="contained"
          startIcon={cloudLoading
            ? <CircularProgress size={16} color="inherit" />
            : <CloudDownload />}
          onClick={handleCloudExport}
          disabled={cloudLoading || !user}
        >
          {cloudLoading ? "Exporting…" : "Export cloud backup"}
        </Button>
        <Collapse in={Boolean(cloudError)}>
          <Alert severity="error" sx={{ mt: 1.5 }} icon={<ErrorOutline />}>
            {cloudError}
          </Alert>
        </Collapse>
        <Collapse in={Boolean(cloudSuccess)}>
          <Alert severity="success" sx={{ mt: 1.5 }}>
            {cloudSuccess}
          </Alert>
        </Collapse>
      </Box>

      <Divider />

      {/* Local export */}
      <Box>
        <Typography variant="subtitle1" gutterBottom>
          Local backup
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Downloads documents stored locally in this browser (offline / not yet
          synced). Attachment files are included only if they have been viewed
          while online.
        </Typography>
        <Button
          variant="outlined"
          startIcon={localLoading
            ? <CircularProgress size={16} color="inherit" />
            : <Download />}
          onClick={handleLocalExport}
          disabled={localLoading}
        >
          {localLoading ? "Exporting…" : "Export local backup"}
        </Button>
        <Collapse in={Boolean(localSuccess)}>
          <Alert severity="success" sx={{ mt: 1.5 }}>
            {localSuccess}
          </Alert>
        </Collapse>
        {localWarnings.length > 0 && (
          <Alert severity="warning" icon={<WarningAmber />} sx={{ mt: 1.5 }}>
            <Typography variant="body2" fontWeight={500} gutterBottom>
              {localWarnings.length} warning
              {localWarnings.length !== 1 ? "s" : ""}
            </Typography>
            <List dense disablePadding>
              {localWarnings.map((w, i) => (
                <ListItem key={i} disableGutters sx={{ py: 0.25 }}>
                  <ListItemText
                    primary={w}
                    primaryTypographyProps={{ variant: "caption" }}
                  />
                </ListItem>
              ))}
            </List>
          </Alert>
        )}
      </Box>
    </Box>
  );
};

// ─── Import tab ───────────────────────────────────────────────────────────────

type ImportTarget = "cloud" | "local";

const ImportTab: React.FC = () => {
  const dispatch = useDispatch();
  const user = useSelector((s) => s.user);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<ImportTarget>("cloud");
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setSelectedFile(f);
    setSummary(null);
    setError(null);
  };

  const handleImport = async () => {
    if (!selectedFile) return;
    setError(null);
    setSummary(null);
    setLoading(true);

    const thunk = target === "cloud" ? importCloudBackup : importLocalBackup;
    const result = await dispatch(thunk(selectedFile));

    setLoading(false);
    if (
      importCloudBackup.rejected.match(result) ||
      importLocalBackup.rejected.match(result)
    ) {
      const payload = result.payload as
        | { title: string; subtitle?: string }
        | undefined;
      setError(payload?.subtitle ?? payload?.title ?? "Import failed");
    } else {
      setSummary(result.payload as ImportSummary);
    }

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
    setSelectedFile(null);
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      <Typography variant="body2" color="text.secondary">
        Select a <code>.zip</code>{" "}
        backup previously exported from this app and choose where to restore it.
        Documents that already exist (same ID or URL handle) will be skipped.
      </Typography>

      {/* Target selector */}
      <Box sx={{ display: "flex", gap: 1 }}>
        {(["cloud", "local"] as ImportTarget[]).map((t) => (
          <Chip
            key={t}
            label={t === "cloud" ? "Cloud (database)" : "Local (this browser)"}
            icon={t === "cloud" ? <CloudUpload /> : <Download />}
            variant={target === t ? "filled" : "outlined"}
            color={target === t ? "primary" : "default"}
            onClick={() => {
              setTarget(t);
              setSummary(null);
              setError(null);
            }}
          />
        ))}
      </Box>

      {target === "cloud" && !user && (
        <Alert severity="info" icon={<InfoOutlined />}>
          Sign in to import into the cloud database.
        </Alert>
      )}

      {/* File picker */}
      <Box
        sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          style={{ display: "none" }}
          id="import-file-input"
          onChange={handleFileChange}
        />
        <label htmlFor="import-file-input">
          <Button
            component="span"
            variant="outlined"
            startIcon={<UploadFile />}
            disabled={loading}
          >
            Choose .zip file
          </Button>
        </label>
        {selectedFile && (
          <Typography variant="body2" color="text.secondary">
            {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)}
            {" "}
            MB)
          </Typography>
        )}
      </Box>

      {/* Import button */}
      <Box>
        <Button
          variant="contained"
          startIcon={loading
            ? <CircularProgress size={16} color="inherit" />
            : <CloudUpload />}
          onClick={handleImport}
          disabled={loading || !selectedFile || (target === "cloud" && !user)}
        >
          {loading ? "Importing…" : "Import backup"}
        </Button>
      </Box>

      {/* Error */}
      <Collapse in={Boolean(error)}>
        <Alert severity="error" icon={<ErrorOutline />}>
          {error}
        </Alert>
      </Collapse>

      {/* Summary */}
      {summary && <ImportSummaryDisplay summary={summary} />}
    </Box>
  );
};

// ─── Import summary ───────────────────────────────────────────────────────────

const ImportSummaryDisplay: React.FC<{ summary: ImportSummary }> = ({
  summary,
}) => {
  const hasErrors = summary.errors.length > 0;
  const hasWarnings = summary.warnings.length > 0;
  const hasSkipped =
    summary.skipped.documents.length + summary.skipped.series.length > 0;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Alert
        severity={hasErrors ? "warning" : "success"}
        icon={hasErrors ? <WarningAmber /> : undefined}
      >
        <Typography variant="subtitle2" gutterBottom>
          Import complete
        </Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 0.5 }}>
          <Chip
            size="small"
            color="success"
            label={`${summary.imported.documents} documents`}
          />
          <Chip
            size="small"
            color="success"
            label={`${summary.imported.series} series`}
          />
          <Chip
            size="small"
            color="success"
            label={`${summary.imported.assets} assets`}
          />
        </Box>
      </Alert>

      {hasSkipped && (
        <Alert severity="info">
          <Typography variant="body2" fontWeight={500} gutterBottom>
            {summary.skipped.documents.length +
              summary.skipped.series.length} skipped (already exist)
          </Typography>
          {summary.skipped.documents.length > 0 && (
            <Typography variant="caption" display="block">
              Documents: {summary.skipped.documents.join(", ")}
            </Typography>
          )}
          {summary.skipped.series.length > 0 && (
            <Typography variant="caption" display="block">
              Series: {summary.skipped.series.join(", ")}
            </Typography>
          )}
        </Alert>
      )}

      {hasWarnings && (
        <Alert severity="warning" icon={<WarningAmber />}>
          <Typography variant="body2" fontWeight={500} gutterBottom>
            {summary.warnings.length} warning
            {summary.warnings.length !== 1 ? "s" : ""}
          </Typography>
          <List dense disablePadding>
            {summary.warnings.map((w, i) => (
              <ListItem key={i} disableGutters sx={{ py: 0.25 }}>
                <ListItemText
                  primary={w}
                  primaryTypographyProps={{ variant: "caption" }}
                />
              </ListItem>
            ))}
          </List>
        </Alert>
      )}

      {hasErrors && (
        <Alert severity="error" icon={<ErrorOutline />}>
          <Typography variant="body2" fontWeight={500} gutterBottom>
            {summary.errors.length} error
            {summary.errors.length !== 1 ? "s" : ""}
          </Typography>
          <List dense disablePadding>
            {summary.errors.map((e, i) => (
              <ListItem key={i} disableGutters sx={{ py: 0.25 }}>
                <ListItemText
                  primary={`${e.id}: ${e.reason}`}
                  primaryTypographyProps={{ variant: "caption" }}
                />
              </ListItem>
            ))}
          </List>
        </Alert>
      )}
    </Box>
  );
};

export default ExportImportPanel;
