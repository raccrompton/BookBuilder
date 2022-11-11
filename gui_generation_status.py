import dearpygui.dearpygui as dpg


class GenerationStatus:
    black = [0, 0, 0]
    red = [255, 0, 0]

    def __init__(self):
        self._line1 = dpg.add_text()
        self._line2 = dpg.add_text()

    def info(self, line1: str = "", line2: str = ""):
        self._set_color(self.black)
        self._set_text(line1, line2)

    def info2(self, line2):
        dpg.set_value(self._line2, line2)

    def error(self, line1: str = "", line2: str = ""):
        self._set_color(self.red)
        self._set_text(line1, line2)

    def _set_color(self, color):
        dpg.configure_item(self._line1, color=color)
        dpg.configure_item(self._line2, color=color)

    def _set_text(self, line1, line2):
        dpg.set_value(self._line1, line1)
        dpg.set_value(self._line2, line2)
