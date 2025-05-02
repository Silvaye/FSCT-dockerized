# Prerequsites

## Docker Install

Install Docker on your computer.

*On Windows, install WSL (Version 2 recommended) first. Installation instructions can be found at [https://learn.microsoft.com/en-us/windows/wsl/install](https://learn.microsoft.com/en-us/windows/wsl/install)*

## Recommended: Install NVIDIA Container Support & Confirm NVIDIA Driver Installation

Follow the instructions found [here](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html#installing-the-nvidia-container-toolkit) to install the NVIDIA Container Toolkit. Install this on your host machine(i.e. the machine that you just installed Docker on). Without this, GPU support is disabled.

Use the following code to add NVIDIA's apt repository.

```bash
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg \
  && curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
    sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
    sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
```

Then the following to update your local repository sources.

```bash
sudo apt-get update
```

Then, finally, install the NVIDIA Container Toolkit!

```bash
sudo apt-get install -y nvidia-container-toolkit
```

## Configure Docker

Configure the container runtime by using the nvidia-ctk command(still on the host):

```bash
sudo nvidia-ctk runtime configure --runtime=docker
```

The nvidia-ctk command modifies the /etc/docker/daemon.json file on the host. The file is updated so that Docker can use the NVIDIA Container Runtime.

Next, restart the docker daemon:

```bash
sudo systemctl restart docker
```

An important note: **We are not using rootless here. Do not put any confidential information in this container. I recommend that you utilize the `--rm` command when starting your container so that the container is deleted after you run it.**

## Creating the Docker Image

Navigate to the folder containing this file in your WSL terminal. Run the following command:

```bash
docker build -t fsct . 
```

This will build your docker image. This may take up some time and space. Be aware.

## Initialize Container

The command I use is as follows:

```bash
docker run --rm --gpus all -it fsct
```

This command will does the following:

- `docker run` - create new container
- `--rm` - delete container after we exit it
- `--gpus all` - gives us access to our gpus in the container
- `-i` - runs the container in interactive mode
- `-t fsct` - use the image with the tag/name 'fsct'

To run the *Web Frontend*, use the `-p host_port:container_port` command(e.g. `-p 8000:5000`)