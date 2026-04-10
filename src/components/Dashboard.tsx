"use client";
import { useSelector } from "@/store";
import { fetchCloudStorageUsage, fetchLocalStorageUsage } from "@/store/app";
import { DocumentStorageUsage } from "@/types";
import UserCard from "./User/UserCard";
import { ExportImportPanel } from "./ExportImportPanel";
import Grid from "@mui/material/Grid2";
import { Box, CircularProgress, Paper, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useEffect, useState } from "react";
import { useErrorAnnounce } from "@/hooks/useErrorAnnounce";
import { PieChart } from "@mui/x-charts/PieChart";
import { Cloud, Login, Storage } from "@mui/icons-material";

const Dashboard: React.FC = () => {
  const user = useSelector((state) => state.user);

  return (
    <Box sx={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
      <UserCard user={user} showActions />

      <StorageChart />

      <ExportImportPanel />
    </Box>
  );
};

export default Dashboard;

type StorageUsage = {
  loading: boolean;
  usage: number;
  details: { value: number; label?: string; color?: string }[];
};

type StorageState = { local: StorageUsage; cloud: StorageUsage };

const initialStorageUsage: StorageUsage = {
  loading: true,
  usage: 0,
  details: [],
};

function parseStoragePayload(documents: DocumentStorageUsage[]): StorageUsage {
  const usage = documents.reduce((acc, d) => acc + (d.size ?? 0), 0) / 1024 /
    1024;
  const details = documents.map((d) => ({
    value: (d.size ?? 0) / 1024 / 1024,
    label: d.name,
  }));
  return { loading: false, usage, details };
}

const StorageEmptyState: React.FC<{
  icon?: React.ReactNode;
  label?: string;
  loading?: boolean;
}> = ({ icon, label, loading }) => (
  <Box
    sx={{
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      height: 300,
      gap: 2,
    }}
  >
    {loading ? <CircularProgress disableShrink /> : (
      <>
        {icon}
        {label && (
          <Typography
            variant="overline"
            component="p"
            sx={{ userSelect: "none" }}
          >
            {label}
          </Typography>
        )}
      </>
    )}
  </Box>
);

const StorageChart: React.FC = () => {
  const user = useSelector((state) => state.user);
  const initialized = useSelector((state) => state.ui.initialized);
  const theme = useTheme();
  const errorAnnounce = useErrorAnnounce();

  const [storageUsage, setStorageUsage] = useState<StorageState>({
    local: initialStorageUsage,
    cloud: initialStorageUsage,
  });

  useEffect(() => {
    fetchLocalStorageUsage().then((payload) => {
      setStorageUsage((prev) => ({
        ...prev,
        local: parseStoragePayload(payload),
      }));
    }).catch((error: unknown) =>
      errorAnnounce("Failed to load local storage usage", error)
    );
  }, []);

  useEffect(() => {
    if (!user) {
      setStorageUsage((prev) => ({
        ...prev,
        cloud: { ...initialStorageUsage, loading: false },
      }));
      return;
    }
    setStorageUsage((prev) => ({ ...prev, cloud: initialStorageUsage }));
    fetchCloudStorageUsage().then((payload) => {
      setStorageUsage((prev) => ({
        ...prev,
        cloud: parseStoragePayload(payload),
      }));
    }).catch((error: unknown) =>
      errorAnnounce("Failed to load cloud storage usage", error)
    );
  }, [user]);

  const { local: localStorageUsage, cloud: cloudStorageUsage } = storageUsage;

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, sm: 6 }}>
        <Paper
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            p: 2,
          }}
        >
          <Typography
            variant="overline"
            gutterBottom
            sx={{ alignSelf: "start", userSelect: "none" }}
          >
            Local Storage
          </Typography>
          {localStorageUsage.loading && <StorageEmptyState loading />}
          {!localStorageUsage.loading && !localStorageUsage.usage && (
            <StorageEmptyState
              icon={<Storage sx={{ width: 64, height: 64, fontSize: 64 }} />}
              label="Local storage is empty"
            />
          )}
          {!!localStorageUsage.usage && (
            <PieChart
              series={[
                {
                  innerRadius: 0,
                  outerRadius: 80,
                  cx: 125,
                  data: [{
                    id: "local",
                    label: "Local",
                    value: localStorageUsage.usage,
                    color: theme.palette.info.light,
                  }],
                  valueFormatter: (item) => `${item.value.toFixed(2)} MB`,
                },
                {
                  innerRadius: 100,
                  outerRadius: 120,
                  cx: 125,
                  data: localStorageUsage.details,
                  valueFormatter: (item) => `${item.value.toFixed(2)} MB`,
                },
              ]}
              width={256}
              height={300}
              slotProps={{ legend: { hidden: true } }}
              sx={{ mx: "auto" }}
            />
          )}
        </Paper>
      </Grid>
      <Grid size={{ xs: 12, sm: 6 }}>
        <Paper
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            p: 2,
          }}
        >
          <Typography
            variant="overline"
            gutterBottom
            sx={{ alignSelf: "start", userSelect: "none" }}
          >
            Cloud Storage
          </Typography>
          {(cloudStorageUsage.loading ||
            (!initialized && !cloudStorageUsage.usage)) && (
            <StorageEmptyState loading />
          )}
          {initialized && !user && !cloudStorageUsage.loading && (
            <StorageEmptyState
              icon={<Login sx={{ width: 64, height: 64, fontSize: 64 }} />}
              label="Please login to use cloud storage"
            />
          )}
          {user && !cloudStorageUsage.loading && !cloudStorageUsage.usage && (
            <StorageEmptyState
              icon={<Cloud sx={{ width: 64, height: 64, fontSize: 64 }} />}
              label="Cloud storage is empty"
            />
          )}
          {!!cloudStorageUsage.usage && (
            <PieChart
              series={[
                {
                  innerRadius: 0,
                  outerRadius: 80,
                  cx: 125,
                  data: [{
                    id: "cloud",
                    label: "Cloud",
                    value: cloudStorageUsage.usage,
                    color: theme.palette.warning.light,
                  }],
                  valueFormatter: (item) => `${item.value.toFixed(2)} MB`,
                },
                {
                  innerRadius: 100,
                  outerRadius: 120,
                  cx: 125,
                  data: cloudStorageUsage.details,
                  valueFormatter: (item) => `${item.value.toFixed(2)} MB`,
                },
              ]}
              width={256}
              height={300}
              slotProps={{ legend: { hidden: true } }}
            />
          )}
        </Paper>
      </Grid>
    </Grid>
  );
};
