from BookBuilder import Grower
from gui import Gui
from settings import Settings

if __name__ == '__main__':
    settings = Settings()
    grower = Grower()
    Gui(settings, grower).create()
