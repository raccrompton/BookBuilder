import webbrowser

import dearpygui.dearpygui as dpg
import psutil

from BookBuilder import Grower
from settings import DatabaseSettings, settings

window_width = 980
window_height = 720

spacer_height = 20
settings_group_xoffset = 180

blog_link = "https://www.alexcrompton.com/blog/automatically-creating-a-practical-opening-repertoire-or-why-your-chess-openings-suck"
source_code_link = "https://github.com/raccrompton/BookBuilder"


def _help(message: str):
    last_item = dpg.last_item()
    group = dpg.add_group(horizontal=True)
    dpg.move_item(last_item, parent=group)
    dpg.capture_next_item(lambda s: dpg.move_item(s, parent=group))
    t = dpg.add_text("(?)", color=[0, 255, 0])
    with dpg.tooltip(t):
        dpg.add_text(message)


def _menu_link(label: str, url: str):
    dpg.add_menu_item(label=label, callback=lambda: webbrowser.open(url))


def menu_bar():
    with dpg.menu_bar():
        with dpg.menu(label="Settings"):
            dpg.add_menu_item(label="Load")
            dpg.add_menu_item(label="Save")
            dpg.add_menu_item(label="Save as...")

        with dpg.menu(label="Help"):
            _menu_link("Announcement blog post and FAQ", blog_link)
            _menu_link("Source code", source_code_link)


def summary():
    dpg.add_text("An automatic practical chess opening repertoire builder using Lichess opening explorer API")
    dpg.add_text("Customize your settings and then press the button below to begin generating your repertoire")
    # todo: make this button more visible - change size and color
    # todo: disable this button after clicking until generation completes

    def start_generation():
        # todo: validate free-input form with book names and PGNs; create Book objects - partially implemented, search for "Invalid PGN"
        # todo: if engine is enabled, validate that the path is correct (or set at all)
        # todo: add some GUI part that displays the progress of generating the repertoire
        Grower().run()

    dpg.add_button(label="Generate PGN", callback=start_generation)
    dpg.add_spacer(height=spacer_height)


def book_settings():
    s = settings.book
    with dpg.group():
        with dpg.collapsing_header(label="Book settings", default_open=False):
            with dpg.group(horizontal=True, xoffset=settings_group_xoffset):
                dpg.add_text("Variations order")
                _help("Choose whether you want chapters ordered from long lines to short lines or the opposite way")
                dpg.add_combo(items=[o.value for o in s.Order], default_value=s.order.value, callback=s.order_callback)

            with dpg.group(horizontal=True, xoffset=settings_group_xoffset):
                dpg.add_text("Opening books")
                _help("Add the starting point PGNs you want to create repertoires for\n"
                      "The format is book name, new line, PGN, new line(s), like so:\n\n"
                      "Book A\n"
                      "1. e4 e5\n\n"
                      "Book B\n"
                      "1. e4 e5 2. f4\n\n"
                      "Tip: Copying and pasting with keyboard shortcuts works in this input!")
                dpg.add_input_text(multiline=True,
                                   tab_input=True,
                                   height=200,
                                   default_value=s.books_string,
                                   callback=s.books_string_callback)


def database_settings():
    s = settings.database
    with dpg.group():
        with dpg.collapsing_header(label="Database settings", default_open=False):
            with dpg.group(horizontal=True, xoffset=settings_group_xoffset):
                dpg.add_text("Variant")
                _help("Variant to use in the analysis")
                dpg.add_combo(
                    items=[v.name for v in s.Variant],
                    default_value=s.variant.name,
                    callback=s.variant_callback)

            with dpg.group(horizontal=True, xoffset=settings_group_xoffset):
                with dpg.group():
                    dpg.add_text("Speeds")
                    _help("Formats to include in the analysis")
                with dpg.group():
                    for speed in DatabaseSettings.Speed:
                        dpg.add_selectable(
                            label=speed.name,
                            user_data=speed.name,
                            default_value=s.speeds.__contains__(speed),
                            callback=s.speed_callback)

            with dpg.group(horizontal=True, xoffset=settings_group_xoffset):
                dpg.add_text("Ratings")
                _help("Ratings of the players to include in the analysis")
                with dpg.group():
                    for rating in DatabaseSettings.Rating:
                        dpg.add_selectable(
                            label=str(rating.value),
                            user_data=rating.name,
                            default_value=s.ratings.__contains__(rating),
                            callback=s.rating_callback)

            with dpg.group(horizontal=True, xoffset=settings_group_xoffset):
                dpg.add_text("Moves")
                _help("The number of most played moves to search over for the best move (minimum 5)")
                dpg.add_input_int(
                    min_value=5,
                    max_value=100,
                    min_clamped=True,
                    default_value=s.moves,
                    callback=s.moves_callback)


def move_selection_settings():
    s = settings.moveSelection
    with dpg.group():
        with dpg.collapsing_header(label="Move selection settings", default_open=False):
            with dpg.group(horizontal=True, xoffset=settings_group_xoffset):
                dpg.add_text("Depth likelihood %")
                _help("This controls how deep moves and lines are generated\n"
                      "The smaller the number the deeper the lines\n"
                      "Once cumulative line likelihood reaches this probability threshold, no further continuations will be added\n"
                      "E.g. for 1% only moves that appear at least once every 100 games will be considered")
                dpg.add_input_float(
                    min_value=0,
                    max_value=10,
                    min_clamped=True,
                    format='%.2f',
                    step=0.01,
                    step_fast=0.1,
                    default_value=s.depth_likelihood * 100,
                    callback=s.depth_callback)

            with dpg.group(horizontal=True, xoffset=settings_group_xoffset):
                dpg.add_text("Alpha %")
                _help("The larger this number the more likely we are to select moves with less data\n"
                      "This is the confidence interval alpha (e.g. 1 = 99% CI), for deciding the lower bounds of how good a move's winrate is")
                dpg.add_input_float(
                    min_value=0,
                    max_value=10,
                    min_clamped=True,
                    format='%.2f',
                    step=0.01,
                    step_fast=0.1,
                    default_value=s.alpha * 100,
                    callback=s.alpha_callback)

            with dpg.group(horizontal=True, xoffset=settings_group_xoffset):
                dpg.add_text("Minimum play rate %")
                _help(
                    "Minimum probability of our move being played in a position to be considered as a 'best move' candidate")
                dpg.add_input_float(
                    min_value=0,
                    max_value=10,
                    min_clamped=True,
                    format='%.2f',
                    step=0.01,
                    step_fast=0.1,
                    default_value=s.min_play_rate * 100,
                    callback=s.min_play_rate_callback)

            with dpg.group(horizontal=True, xoffset=settings_group_xoffset):
                dpg.add_text("Minimum games")
                _help(
                    "Games where our moves were played this or fewer times will be discarded (unless top engine move)")
                dpg.add_input_int(
                    min_value=0,
                    min_clamped=True,
                    default_value=s.min_games,
                    callback=s.min_games_callback)

            with dpg.group(horizontal=True, xoffset=settings_group_xoffset):
                dpg.add_text("Continuation games")
                _help(
                    "Games where moves played this or fewer times will not be considered a valid opponent continuation\n"
                    "I.e. we don't want to be inferring cumulative probability or likely lines from tiny amounts of games/1 game")
                dpg.add_input_int(
                    min_value=0,
                    min_clamped=True,
                    default_value=s.continuation_games,
                    callback=s.continuation_games_callback)

            with dpg.group(horizontal=True, xoffset=settings_group_xoffset):
                dpg.add_text("Draws are half")
                _help(
                    "Select this if you want to count draws as half a win (0.5 points) for the win rate calculation\n"
                    "When not selected draws will count as as losses")
                dpg.add_checkbox(default_value=s.draws_are_half, callback=s.draws_are_half_callback)


def engine_settings():
    s = settings.engine
    with dpg.group():
        with dpg.collapsing_header(label="Engine settings", default_open=True):
            with dpg.group(horizontal=True, xoffset=settings_group_xoffset):
                dpg.add_text("Use engine")
                _help("Select this if you want to use engine evaluations of positions or engine finishing")
                dpg.add_checkbox(default_value=s.enabled, callback=s.enabled_callback)

            with dpg.group(horizontal=True, xoffset=settings_group_xoffset):
                dpg.add_text("Engine path")
                _help("Select where the engine is stored on your computer\n"
                      "It should be a file named similar to 'stockfish_15_x64_avx2.exe'")
                with dpg.group():
                    with dpg.group(horizontal=True):
                        engine_path_text = dpg.add_text(s.path)

                        def call_path_callback_and_update_path_in_gui(_, file_selections):
                            s.path_callback(file_selections)
                            dpg.set_value(engine_path_text, s.path)

                        with dpg.file_dialog(label="Select engine file",
                                             width=window_width - 100,
                                             height=window_height - 100,
                                             show=False,
                                             callback=call_path_callback_and_update_path_in_gui):
                            dpg.add_file_extension(".*")
                            dpg.add_file_extension("", color=(0, 255, 255, 255))
                            dpg.add_file_extension(".exe", color=(0, 255, 0, 255))

                        dpg.add_button(label="Select engine file",
                                       user_data=dpg.last_container(),
                                       callback=lambda _, a, u: dpg.configure_item(u, show=True))

                    with dpg.group(horizontal=True):
                        dpg.add_text("You can download the latest Stockfish executable from here:")
                        dpg.add_button(
                            label="Download Stockfish",
                            callback=lambda: webbrowser.open("https://stockfishchess.org/download/"))
                    dpg.add_text(
                        "On Mac download engine only (not the app) and run `which stockfish` in Terminal to see where it's installed")

            with dpg.group(horizontal=True, xoffset=settings_group_xoffset):
                dpg.add_text("Engine finish")
                _help(
                    "Select to allow the engine to complete lines upto the cumulative likelihood, where human data doesn't meet the minimum criteria\n"
                    "When not selected lines will end when there is no good human data for one player")
                dpg.add_checkbox(default_value=s.finish, callback=s.finish_callback)

            with dpg.group(horizontal=True, xoffset=settings_group_xoffset):
                dpg.add_text("Engine depth")
                _help("To what depth the engine should evaluate best moves\n"
                      "The higher this number the longer the evaluation will take\n\n"
                      "RECOMMENDED a minimum of 20+, ideally 30+ for stable evaluations in the opening phase")
                dpg.add_input_int(
                    min_value=1,
                    min_clamped=True,
                    default_value=s.depth,
                    callback=s.depth_callback)

            with dpg.group(horizontal=True, xoffset=settings_group_xoffset):
                logical_cores = psutil.cpu_count(logical=True)
                dpg.add_text("Engine threads")
                _help("How many threads you want the engine to use\n"
                      "Increase this number to speed the engine up, at the cost of higher CPU usage\n\n"
                      f"Your processor has {logical_cores} logical cores")
                dpg.add_input_int(
                    min_value=1,
                    max_value=logical_cores,
                    min_clamped=True,
                    max_clamped=True,
                    default_value=s.threads,
                    callback=s.threads_callback)

            with dpg.group(horizontal=True, xoffset=settings_group_xoffset):
                total_ram_in_mb = int(psutil.virtual_memory().total / 1024 / 1024)
                available_ram_in_mb = int(psutil.virtual_memory().available / 1024 / 1024)
                dpg.add_text("Engine hash in MB")
                _help("How much RAM you want the engine to use\n"
                      "Increase this number to speed the engine up\n\n"
                      f"You have {total_ram_in_mb} MB total RAM and around {available_ram_in_mb} MB available (unused) RAM")
                dpg.add_input_int(
                    min_value=16,
                    max_value=total_ram_in_mb,
                    min_clamped=True,
                    max_clamped=True,
                    default_value=s.hash,
                    callback=s.hash_callback)

            with dpg.group(horizontal=True, xoffset=settings_group_xoffset):
                dpg.add_text("Soundness limit")
                _help(
                    "Maximum centipawns we are willing to be down in engine eval, provided the winrate is better (-300 = losing by 3 pawns in eval)\n"
                    "We never give up a forced mate, however\n\n"
                    "Example:\n"
                    "Move A has 60% human win rate at -1.1 engine evaluation\n"
                    "Move B has 55% human win rate at -0.9 engine evaluation\n"
                    "With soundness limit of -99 centipawns (-0.99) we will select move B, as -1.1 exceeds -0.99")
                dpg.add_input_int(default_value=s.soundness_limit, callback=s.soundness_limit_callback)

            with dpg.group(horizontal=True, xoffset=settings_group_xoffset):
                dpg.add_text("Move loss limit")
                _help(
                    "Maximum centipawns we are willing to lose per move in favor of a higher human winrate move, compared to the top engine choice\n"
                    "We never give up a forced mate, however\n\n"
                    "RECOMMENDED to not go closer to 0 than -50 because engines are inconsistent when evaluating openings, especially on low depth\n\n"
                    "Example:\n"
                    "Move A has 80% human win rate at 1.0 engine evaluation\n"
                    "Move B has 60% human win rate at 2.0 engine evaluation\n"
                    "With move loss limit of -99 centipawns (-0.99) we will select move B, as 1.0-2.0=-1.0 exceeds -0.99")
                dpg.add_input_int(default_value=s.move_loss_limit, callback=s.move_loss_limit_callback)

            with dpg.group(horizontal=True, xoffset=settings_group_xoffset):
                dpg.add_text("Ignore loss limit")
                _help(
                    "Centipawns advantage above which we won't care if we play a move that hits our loss limit, if it has a higher human win rate\n\n"
                    "Example:\n"
                    "Move A has 80% human win rate at 3.2 engine evaluation\n"
                    "Move B has 60% human win rate at 5.7 engine evaluation\n"
                    "With ignore loss limit of 300 centipawns (3.0) we will select move A, as 3.2 exceeds 3.0")
                dpg.add_input_int(default_value=s.ignore_loss_limit, callback=s.ignore_loss_limit_callback)


def create_gui():
    dpg.create_context()

    with dpg.window(tag="Primary window"):
        menu_bar()
        summary()
        book_settings()
        database_settings()
        move_selection_settings()
        engine_settings()
    dpg.set_primary_window("Primary window", True)

    dpg.create_viewport(
        title='BookBuilder',
        width=window_width,
        min_width=window_width,
        height=window_height,
        x_pos=0,
        y_pos=0)

    dpg.setup_dearpygui()
    dpg.show_viewport()
    dpg.start_dearpygui()
    dpg.destroy_context()
