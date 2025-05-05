# Use older CUDA base image to ensure PYG compatibility - 
# CUDA 12.6 base for PyTorch compatibility
FROM nvidia/cuda:12.6.3-cudnn-devel-ubuntu24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV HOME="/root"

# Use bash by default
SHELL ["/bin/bash", "-c"]

# System deps
RUN apt update && apt install -y \
    curl wget gcc \
    python3 python3-pip python3-venv && \
    ln -s /usr/bin/python3 /usr/bin/python

# Python deps (minimal pinning)
COPY requirements.txt .
RUN pip install --break-system-packages -r requirements.txt

EXPOSE 5000