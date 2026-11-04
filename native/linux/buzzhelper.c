// Buzz Party Linux helper: a virtual keyboard made through /dev/uinput.
// One command per stdin line, one reply line on stdout (same style as the macOS helper).
//   down <keycode> | up <keycode>   -> ok | fail   (Linux KEY_* codes)
//   fullscreen                      -> ok | fail   (Alt+Enter, PCSX2's hotkey)
//   trust <0|1>                     -> yes | no    (yes = /dev/uinput is usable)
// Build: cc -O2 native/linux/buzzhelper.c -o build/buzzhelper
// Needs write access to /dev/uinput (add your user to the "input" group and add
// a udev rule, see the README).
#include <fcntl.h>
#include <linux/uinput.h>
#include <stdio.h>
#include <string.h>
#include <sys/ioctl.h>
#include <unistd.h>

static int fd = -1;

static int emit(int type, int code, int value) {
  struct input_event ev;
  memset(&ev, 0, sizeof ev);
  ev.type = type;
  ev.code = code;
  ev.value = value;
  return write(fd, &ev, sizeof ev) == (ssize_t)sizeof ev;
}

static int key(int code, int down) {
  if (fd < 0) return 0;
  return emit(EV_KEY, code, down) && emit(EV_SYN, SYN_REPORT, 0);
}

// Creates the virtual keyboard once; later calls are cheap. Retried on every
// command while it has not worked, so fixing the permissions needs no restart.
static int ensure_device(void) {
  if (fd >= 0) return 1;
  int f = open("/dev/uinput", O_WRONLY | O_NONBLOCK);
  if (f < 0) return 0;
  if (ioctl(f, UI_SET_EVBIT, EV_KEY) < 0 || ioctl(f, UI_SET_EVBIT, EV_SYN) < 0) {
    close(f);
    return 0;
  }
  for (int c = 1; c < 256; c++) ioctl(f, UI_SET_KEYBIT, c);
  struct uinput_setup us;
  memset(&us, 0, sizeof us);
  us.id.bustype = BUS_USB;
  us.id.vendor = 0x1209;
  us.id.product = 0xb022;
  strncpy(us.name, "Buzz Party Keyboard", UINPUT_MAX_NAME_SIZE - 1);
  if (ioctl(f, UI_DEV_SETUP, &us) < 0 || ioctl(f, UI_DEV_CREATE) < 0) {
    close(f);
    return 0;
  }
  fd = f;
  usleep(300000); // let the desktop notice the new device before the first key
  return 1;
}

static void reply(const char *s) {
  puts(s);
  fflush(stdout);
}

int main(void) {
  char line[128];
  while (fgets(line, sizeof line, stdin)) {
    char cmd[16] = "";
    int n = 0;
    int args = sscanf(line, "%15s %d", cmd, &n);
    if (args < 1) {
      reply("fail");
    } else if (strcmp(cmd, "trust") == 0) {
      reply(ensure_device() ? "yes" : "no");
    } else if (strcmp(cmd, "down") == 0 || strcmp(cmd, "up") == 0) {
      if (args == 2 && n >= 1 && n < 256 && ensure_device()) reply(key(n, cmd[0] == 'd') ? "ok" : "fail");
      else reply("fail");
    } else if (strcmp(cmd, "fullscreen") == 0) {
      int ok = ensure_device() && key(KEY_LEFTALT, 1) && key(KEY_ENTER, 1) && key(KEY_ENTER, 0) && key(KEY_LEFTALT, 0);
      reply(ok ? "ok" : "fail");
    } else {
      reply("fail");
    }
  }
  if (fd >= 0) {
    ioctl(fd, UI_DEV_DESTROY);
    close(fd);
  }
  return 0;
}
