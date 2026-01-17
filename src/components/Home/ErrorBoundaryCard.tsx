"use client";
import { Box, Button, Typography } from "@mui/material";
import { ErrorOutline, Refresh } from "@mui/icons-material";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  cardName: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundaryCard extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`Error in ${this.props.cardName}:`, error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <Box
          sx={{
            height: "100%",
            minHeight: 200,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 1.5,
            p: 3,
            borderRadius: 3,
            bgcolor: "action.hover",
            textAlign: "center",
          }}
        >
          <ErrorOutline
            sx={{ fontSize: 40, color: "error.main", opacity: 0.7 }}
          />
          <Typography variant="body2" color="text.secondary">
            Failed to load {this.props.cardName}
          </Typography>
          <Button
            size="small"
            startIcon={<Refresh />}
            onClick={this.handleRetry}
            sx={{ textTransform: "none" }}
          >
            Retry
          </Button>
        </Box>
      );
    }

    return this.props.children;
  }
}
