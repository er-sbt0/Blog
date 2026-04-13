"use client";
import { FC, ReactNode, useMemo } from "react";
import { Tab, Tabs } from "@mui/material";
import {
  AccountCircle,
  Cloud,
  CloudDone,
  CloudSync,
  DoneAll,
  GroupWork,
  MobileFriendly,
  PeopleOutline,
  Public,
  Security,
  SupervisedUserCircle,
  TextSnippet,
  Workspaces,
} from "@mui/icons-material";
import { SxProps, Theme } from "@mui/material/styles";

interface FilterOption {
  key: string;
  label: string;
  icon: ReactNode;
}

const options: FilterOption[] = [
  { key: "local", label: "Local", icon: <MobileFriendly /> },
  { key: "cloud", label: "Cloud", icon: <Cloud /> },
  { key: "published", label: "Published", icon: <Public /> },
  { key: "collab", label: "Collab", icon: <Workspaces /> },
  { key: "private", label: "Private", icon: <Security /> },
  { key: "synced", label: "Synced", icon: <CloudDone /> },
  { key: "out-of-sync", label: "Out of Sync", icon: <CloudSync /> },
  { key: "author", label: "Author", icon: <AccountCircle /> },
  { key: "coauthor", label: "Coauthor", icon: <SupervisedUserCircle /> },
  { key: "collaborator", label: "Collaborator", icon: <GroupWork /> },
  { key: "others", label: "Others", icon: <PeopleOutline /> },
  { key: "posts", label: "Posts", icon: <TextSnippet /> },
];

const DocumentFilterControl: FC<{
  value: Set<string>;
  setValue: (value: Set<string>) => void;
  sx?: SxProps<Theme> | undefined;
}> = ({ value, setValue, sx }) => {
  const tabsValue = useMemo(() => {
    if (value.size === 0) return 0;
    const lastSelectedIndex = options.findLastIndex((opt) =>
      value.has(opt.key)
    );
    return lastSelectedIndex + 1;
  }, [value]);

  const handleFilterChange = (optionKey: string) => {
    const next = new Set(value);
    if (next.has(optionKey)) {
      next.delete(optionKey);
    } else {
      next.add(optionKey);
    }
    setValue(next);
  };

  const handleReset = () => {
    setValue(new Set());
  };

  const isEmpty = value.size === 0;

  return (
    <Tabs
      value={tabsValue}
      variant="scrollable"
      scrollButtons
      allowScrollButtonsMobile
      sx={{
        height: 40,
        minHeight: 40,
        "& .MuiTabScrollButton-root.Mui-disabled": {
          opacity: 1,
          color: "text.disabled",
        },
        "& .MuiTabs-flexContainer": {
          height: "100%",
          gap: 1,
          alignItems: "center",
        },
        "& .MuiTabs-indicator": {
          display: "none",
        },
        "& .MuiTab-root": {
          height: 32,
          minHeight: 32,
          minWidth: "unset",
          px: 1,
          borderRadius: 4,
          "&.Mui-selected": {
            color: "primary.contrastText",
          },
        },
        ...sx,
      }}
    >
      <Tab
        key="all"
        iconPosition="start"
        icon={<DoneAll />}
        label={<span className="MuiTab-label">All</span>}
        onClick={handleReset}
        sx={{
          color: isEmpty ? "primary.contrastText" : "text.secondary",
          backgroundColor: isEmpty ? "primary.main" : "action.selected",
          "& .MuiTab-label": {
            display: {
              xs: isEmpty ? "block" : "none",
              sm: "block",
            },
          },
          "& .MuiTab-icon": {
            marginRight: { xs: isEmpty ? 1 : 0, sm: 1 },
          },
        }}
      />
      {options.map((option) => {
        const isSelected = value.has(option.key);
        return (
          <Tab
            key={option.key}
            iconPosition="start"
            icon={option.icon}
            label={<span className="MuiTab-label">{option.label}</span>}
            onClick={() => handleFilterChange(option.key)}
            sx={{
              color: isSelected ? "primary.contrastText" : "text.secondary",
              backgroundColor: isSelected ? "primary.main" : "action.selected",
              "& .MuiTab-label": {
                display: {
                  xs: isSelected ? "block" : "none",
                  sm: "block",
                },
              },
              "& .MuiTab-icon": {
                marginRight: {
                  xs: isSelected ? 1 : 0,
                  sm: 1,
                },
              },
            }}
          />
        );
      })}
    </Tabs>
  );
};

export default DocumentFilterControl;
